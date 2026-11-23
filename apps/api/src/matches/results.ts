import { Body, Controller, Get, HttpCode, Injectable, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { DISPUTE_DECISIONS, TIMEZONE, hasPermission, type DisputeDecision, type ResultStatus } from '@saha/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { Db } from '../audit/write-audit';
import { AppError } from '../common/arabic-error.filter';
import { idParam, int, oneOf, str } from '../common/validate';
import { AuthGuard, assertActive, assertCan } from '../auth/auth.guard';
import { clientIp, type AuthContext, type AuthedRequest } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications';
import { UploadsService } from '../uploads/uploads';
import { applyConfirm, disputeDeadline, isKnockout, scoreError, statusAfterDecision, tally, windowOpen, type Remedy, type Score } from './result-flow';

type B = Record<string, unknown>;
type Ctx = { auth: AuthContext; ip: string };

const SCORE_ERRORS: Record<NonNullable<ReturnType<typeof scoreError>>, string> = {
  PENS_PAIR: 'أدخل ركلات الترجيح للفريقين معاً.',
  PENS_NOT_ALLOWED: 'ركلات الترجيح في الأدوار الإقصائية عند التعادل فقط.',
  PENS_REQUIRED: 'المباراة الإقصائية لا تنتهي بالتعادل؛ أدخل نتيجة ركلات الترجيح.',
  PENS_TIE: 'ركلات الترجيح لا تنتهي بالتعادل.',
};

const LOCKED: Partial<Record<ResultStatus, [string, string]>> = {
  scheduled: ['NO_RESULT', 'لم يُدخل الحكم نتيجة هذه المباراة بعد.'],
  confirmed: ['RESULT_CONFIRMED', 'أكّد الفريقان النتيجة؛ لا تُعدَّل ولا يُعترض عليها.'],
  disputed: ['RESULT_DISPUTED', 'النتيجة قيد الاعتراض؛ القرار للجنة الانضباط.'],
  final: ['RESULT_FINAL', 'النتيجة نهائية.'],
};
const locked = (s: ResultStatus) => {
  const [code, msg] = LOCKED[s] ?? ['INVALID_STATE', 'لا يمكن تنفيذ هذا الإجراء في حالة المباراة الحالية.'];
  return new AppError(409, code, msg);
};
const raced = () => new AppError(409, 'STATE_CHANGED', 'تغيّرت حالة المباراة الآن. حدّث الصفحة وأعد المحاولة.');

/** موعد بتوقيت بغداد وأرقام 0–9 */
export const baghdadTime = (d: Date) =>
  new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(d);

const MATCH_INCLUDE = {
  tournament: { select: { id: true, nameAr: true, status: true, disputeWindowHrs: true } },
  homeTeam: { select: { id: true, nameAr: true } },
  awayTeam: { select: { id: true, nameAr: true } },
} as const;
type LoadedMatch = Prisma.MatchGetPayload<{ include: typeof MATCH_INCLUDE }>;

/** حالة النتيجة كما تُعاد بعد كل إجراء */
export function resultState(m: LoadedMatch) {
  return {
    id: m.id, resultStatus: m.resultStatus,
    homeScore: m.homeScore, awayScore: m.awayScore, homePens: m.homePens, awayPens: m.awayPens,
    homeConfirmed: m.homeConfirmed, awayConfirmed: m.awayConfirmed,
    resultEnteredAt: m.resultEnteredAt, finalizedAt: m.finalizedAt,
    disputeDeadline: m.resultStatus === 'provisional' || m.resultStatus === 'confirmed' ? disputeDeadline(m.resultEnteredAt, m.tournament.disputeWindowHrs) : null,
    hasSheet: m.sheetMediaId !== null,
  };
}

const scoreLine = (m: { homeTeam: { nameAr: string }; awayTeam: { nameAr: string } }, s: Score) =>
  `${m.homeTeam.nameAr} ${s.homeScore} - ${s.awayScore} ${m.awayTeam.nameAr}${s.homePens !== null ? ` (ترجيح ${s.homePens} - ${s.awayPens})` : ''}`;

/** الفرق التي يديرها المستخدم (دور مدير فريق مقيّد بالفريق) — المدير العام لا يؤكد نيابة عن الفرق */
const managedSides = (auth: AuthContext, m: { homeTeamId: number; awayTeamId: number }) => ({
  home: auth.grants.some((g) => g.role === 'team_manager' && g.teamId === m.homeTeamId),
  away: auth.grants.some((g) => g.role === 'team_manager' && g.teamId === m.awayTeamId),
});

/**
 * الجلسة 4 — النتائج والاعتراضات:
 * الحكم يدخل النتيجة مع صورة الورقة ← مديرا الفريقين يؤكدان أو يعترضان خلال نافذة البطولة ← تصبح نهائية تلقائياً
 * عند انتهاء النافذة بلا اعتراض ← الاعتراض يذهب للجنة الانضباط (3 أعضاء، القرار بصوتين متطابقين).
 */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {}

  private async load(id: number, db: Db = this.prisma): Promise<LoadedMatch> {
    const m = await db.match.findUnique({ where: { id }, include: MATCH_INCLUDE });
    if (!m) throw new AppError(404, 'MATCH_NOT_FOUND', 'المباراة غير موجودة.');
    return m;
  }

  /** مستخدمو دور مدير الفريق لكل فريق */
  private async managers(teamIds: number[], db: Db = this.prisma) {
    const rows = await db.userRole.findMany({ where: { role: 'team_manager', teamId: { in: teamIds }, user: { status: 'active' } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  private async committee(tournamentId: number, db: Db = this.prisma) {
    const rows = await db.userRole.findMany({
      where: { role: { in: ['discipline_committee', 'tournament_manager'] }, OR: [{ tournamentId: null }, { tournamentId }], user: { status: 'active' } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ───────────── إدخال النتيجة (الحكم) ─────────────

  /** POST /matches/:id/result {homeScore, awayScore, homePens?, awayPens?, sheetMediaId} */
  async enter(id: number, body: B, { auth, ip }: Ctx) {
    const m = await this.load(id);
    assertActive(auth);
    assertCan(auth, 'results.enter', { tournamentId: m.tournamentId });
    if (m.refereeId !== auth.userId && !hasPermission(auth.grants, 'tournaments.manage', { tournamentId: m.tournamentId }, auth.mfa)) {
      throw new AppError(403, 'NOT_MATCH_REFEREE', 'النتيجة يدخلها حكم المباراة المعيَّن أو إدارة البطولة.');
    }
    if (m.tournament.status !== 'running') throw new AppError(409, 'TOURNAMENT_NOT_RUNNING', 'البطولة ليست جارية.');
    if (m.resultStatus !== 'scheduled' && m.resultStatus !== 'provisional') throw locked(m.resultStatus);
    if (!m.kickoffAt || m.kickoffAt > new Date()) throw new AppError(409, 'NOT_STARTED', 'لا تُدخل النتيجة قبل موعد انطلاق المباراة.');

    const score: Score = {
      homeScore: int(body, 'homeScore', { min: 0, max: 99, label: 'أهداف صاحب الأرض' })!,
      awayScore: int(body, 'awayScore', { min: 0, max: 99, label: 'أهداف الضيف' })!,
      homePens: int(body, 'homePens', { optional: true, min: 0, max: 99, label: 'ترجيح صاحب الأرض' }) ?? null,
      awayPens: int(body, 'awayPens', { optional: true, min: 0, max: 99, label: 'ترجيح الضيف' }) ?? null,
    };
    const err = scoreError(score, isKnockout(m.stage));
    if (err) throw new AppError(400, err, SCORE_ERRORS[err]);

    let sheetMediaId = int(body, 'sheetMediaId', { optional: true, min: 1, label: 'صورة ورقة المباراة' }) ?? null;
    if (sheetMediaId === null && m.sheetMediaId === null) throw new AppError(400, 'SHEET_REQUIRED', 'أرفق صورة ورقة المباراة.');
    if (sheetMediaId !== null) {
      const media = await this.prisma.mediaAsset.findUnique({ where: { id: sheetMediaId } });
      if (!media || media.uploadedById !== auth.userId) throw new AppError(400, 'SHEET_INVALID', 'صورة الورقة غير موجودة أو لم ترفعها أنت.');
    } else sheetMediaId = m.sheetMediaId;

    const now = new Date();
    const deadline = disputeDeadline(now, m.tournament.disputeWindowHrs)!;
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.match.updateMany({
        where: { id, resultStatus: m.resultStatus, resultEnteredAt: m.resultEnteredAt },
        data: {
          ...score, resultStatus: 'provisional', homeConfirmed: false, awayConfirmed: false,
          resultEnteredAt: now, finalizedAt: null, sheetMediaId, sheetPhotoUrl: `/api/v1/matches/${id}/sheet`,
        },
      });
      if (!r.count) throw raced();
      await this.audit.record({
        actorUserId: auth.userId, action: m.resultStatus === 'scheduled' ? 'match.result' : 'match.result_correct', entity: 'match', entityId: id,
        payload: { from: m.resultStatus, to: 'provisional', ...score, previous: m.resultStatus === 'scheduled' ? null : { homeScore: m.homeScore, awayScore: m.awayScore, homePens: m.homePens, awayPens: m.awayPens }, sheetMediaId },
        ip,
      }, tx);
      await this.notifications.notify(await this.managers([m.homeTeamId, m.awayTeamId], tx), {
        titleAr: m.resultStatus === 'scheduled' ? 'نتيجة بانتظار تأكيدك' : 'صحّح الحكم النتيجة — أكّدها من جديد',
        bodyAr: `${scoreLine(m, score)} — ${m.tournament.nameAr}. أكّد النتيجة أو اعترض قبل ${baghdadTime(deadline)}، وبعدها تصبح نهائية تلقائياً.`,
        data: { type: 'result.entered', matchId: id },
      }, tx);
    });
    return resultState(await this.load(id));
  }

  // ───────────── التأكيد (مدير الفريق) ─────────────

  /** POST /matches/:id/confirm */
  async confirm(id: number, { auth, ip }: Ctx) {
    const m = await this.load(id);
    assertActive(auth);
    const sides = managedSides(auth, m);
    if (!sides.home && !sides.away) throw new AppError(403, 'NOT_TEAM_MANAGER', 'تأكيد النتيجة لمديري الفريقين فقط.');
    if (m.resultStatus !== 'provisional') throw locked(m.resultStatus);
    if (!windowOpen(m.resultEnteredAt, m.tournament.disputeWindowHrs)) throw new AppError(409, 'WINDOW_CLOSED', 'انتهت مهلة التأكيد؛ النتيجة تصبح نهائية تلقائياً.');
    const next = applyConfirm(m, sides);
    if (next.homeConfirmed === m.homeConfirmed && next.awayConfirmed === m.awayConfirmed) return resultState(m);

    await this.prisma.$transaction(async (tx) => {
      const r = await tx.match.updateMany({ where: { id, resultStatus: 'provisional', resultEnteredAt: m.resultEnteredAt }, data: next });
      if (!r.count) throw raced();
      await this.audit.record({ actorUserId: auth.userId, action: 'match.confirm', entity: 'match', entityId: id, payload: { sides, ...next }, ip }, tx);
      if (next.resultStatus === 'confirmed') {
        await this.notifications.notify([m.refereeId, ...(await this.managers([m.homeTeamId, m.awayTeamId], tx))], {
          titleAr: 'اعتُمدت النتيجة',
          bodyAr: `أكّد الفريقان نتيجة ${scoreLine(m, m as Score)} — ${m.tournament.nameAr}.`,
          data: { type: 'result.confirmed', matchId: id },
        }, tx);
      }
    });
    return resultState(await this.load(id));
  }

  // ───────────── الاعتراض (مدير الفريق) ─────────────

  /** POST /matches/:id/disputes {reason} */
  async raise(id: number, body: B, { auth, ip }: Ctx) {
    const m = await this.load(id);
    assertActive(auth);
    const sides = managedSides(auth, m);
    if (!sides.home && !sides.away) throw new AppError(403, 'NOT_TEAM_MANAGER', 'الاعتراض لمديري الفريقين فقط.');
    if (m.resultStatus !== 'provisional') throw locked(m.resultStatus);
    if (!windowOpen(m.resultEnteredAt, m.tournament.disputeWindowHrs)) throw new AppError(409, 'WINDOW_CLOSED', 'انتهت مهلة الاعتراض.');
    // من أكّد النتيجة لا يعترض عليها؛ مدير الفريقين معاً يعترض باسم الفريق الذي لم يؤكد
    const side = sides.home && !m.homeConfirmed ? 'home' : sides.away && !m.awayConfirmed ? 'away' : null;
    if (!side) throw new AppError(409, 'ALREADY_CONFIRMED', 'أكّدت النتيجة؛ لا يمكنك الاعتراض عليها.');
    const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const reason = str(body, 'reason', { min: 10, max: 1000, label: 'سبب الاعتراض' })!;

    const dispute = await this.prisma.$transaction(async (tx) => {
      const r = await tx.match.updateMany({ where: { id, resultStatus: 'provisional', resultEnteredAt: m.resultEnteredAt }, data: { resultStatus: 'disputed' } });
      if (!r.count) throw raced();
      const d = await tx.dispute.create({ data: { matchId: id, raisedById: auth.userId, teamId, reason } });
      await this.audit.record({ actorUserId: auth.userId, action: 'dispute.open', entity: 'dispute', entityId: d.id, payload: { matchId: id, teamId, reason }, ip }, tx);
      const teamName = side === 'home' ? m.homeTeam.nameAr : m.awayTeam.nameAr;
      const everyone = [m.refereeId, ...(await this.managers([m.homeTeamId, m.awayTeamId], tx)), ...(await this.committee(m.tournamentId, tx))];
      await this.notifications.notify(everyone.filter((u) => u !== auth.userId), {
        titleAr: 'اعتراض على نتيجة',
        bodyAr: `اعترض ${teamName} على نتيجة ${scoreLine(m, m as Score)} — ${m.tournament.nameAr}. النتيجة لا تدخل الترتيب حتى تبت لجنة الانضباط.`,
        data: { type: 'dispute.opened', matchId: id, disputeId: d.id },
      }, tx);
      return d;
    });
    return { dispute: { id: dispute.id, status: dispute.status, teamId, reason, createdAt: dispute.createdAt }, match: resultState(await this.load(id)) };
  }

  // ───────────── لجنة الانضباط ─────────────

  /** البطولات التي يبت المستخدم في اعتراضاتها: null = كلها */
  private decideScope(auth: AuthContext): number[] | null {
    if (hasPermission(auth.grants, 'disputes.decide', {}, auth.mfa)) return null;
    const ids = auth.grants.filter((g) => g.tournamentId != null && hasPermission([g], 'disputes.decide', { tournamentId: g.tournamentId }, auth.mfa)).map((g) => g.tournamentId!);
    if (!ids.length) throw new AppError(403, 'FORBIDDEN', 'لا تملك صلاحية لهذا الإجراء.');
    return ids;
  }

  /** GET /admin/disputes?status=open|upheld|rejected */
  async list(auth: AuthContext, status?: string) {
    const scope = this.decideScope(auth);
    if (status && !['open', 'upheld', 'rejected'].includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'قيمة الحالة غير معروفة.');
    const rows = await this.prisma.dispute.findMany({
      where: { ...(status ? { status: status as 'open' } : {}), ...(scope ? { match: { tournamentId: { in: scope } } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: {
        match: { include: MATCH_INCLUDE },
        team: { select: { id: true, nameAr: true } },
        raisedBy: { select: { id: true, fullName: true } },
        votes: { select: { memberId: true, decision: true, homeScore: true, awayScore: true, homePens: true, awayPens: true, note: true, createdAt: true } },
      },
    });
    return rows.map((d) => ({
      id: d.id, status: d.status, decision: d.decision, decisionNote: d.decisionNote, reason: d.reason, createdAt: d.createdAt, decidedAt: d.decidedAt,
      team: d.team, raisedBy: d.raisedBy,
      match: { ...resultState(d.match), tournament: d.match.tournament, homeTeam: d.match.homeTeam, awayTeam: d.match.awayTeam, stage: d.match.stage, kickoffAt: d.match.kickoffAt },
      votes: d.votes.length,
      myVote: d.votes.find((v) => v.memberId === auth.userId) ?? null,
    }));
  }

  /** POST /admin/disputes/:id/vote {decision: reject|correct|replay, homeScore?, awayScore?, homePens?, awayPens?, note?} */
  async vote(disputeId: number, body: B, { auth, ip }: Ctx) {
    const d0 = await this.prisma.dispute.findUnique({ where: { id: disputeId }, include: { match: { include: MATCH_INCLUDE } } });
    if (!d0) throw new AppError(404, 'DISPUTE_NOT_FOUND', 'الاعتراض غير موجود.');
    const m = d0.match;
    assertActive(auth);
    assertCan(auth, 'disputes.decide', { tournamentId: m.tournamentId });
    const sides = managedSides(auth, m);
    if (m.refereeId === auth.userId || d0.raisedById === auth.userId || sides.home || sides.away) {
      throw new AppError(403, 'CONFLICT_OF_INTEREST', 'لا يصوّت عضو له صلة بالمباراة (حكمها أو مدير أحد فريقيها).');
    }

    const decision = oneOf(body, 'decision', DISPUTE_DECISIONS, { label: 'القرار' })! as DisputeDecision;
    let remedy: Remedy;
    if (decision === 'correct') {
      const s: Score = {
        homeScore: int(body, 'homeScore', { min: 0, max: 99, label: 'أهداف صاحب الأرض' })!,
        awayScore: int(body, 'awayScore', { min: 0, max: 99, label: 'أهداف الضيف' })!,
        homePens: int(body, 'homePens', { optional: true, min: 0, max: 99, label: 'ترجيح صاحب الأرض' }) ?? null,
        awayPens: int(body, 'awayPens', { optional: true, min: 0, max: 99, label: 'ترجيح الضيف' }) ?? null,
      };
      const err = scoreError(s, isKnockout(m.stage));
      if (err) throw new AppError(400, err, SCORE_ERRORS[err]);
      remedy = { decision, ...s };
    } else remedy = { decision };
    const note = str(body, 'note', { optional: true, max: 500, label: 'ملاحظة' }) ?? null;
    const s = remedy.decision === 'correct' ? remedy : null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      // قفل صف الاعتراض حتى لا يُحسم مرتين بصوتين متزامنين
      await tx.$queryRaw`SELECT id FROM disputes WHERE id = ${disputeId} FOR UPDATE`;
      const d = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } });
      if (d.status !== 'open') throw new AppError(409, 'DISPUTE_CLOSED', 'حُسم هذا الاعتراض.');
      const voteData = {
        uphold: decision !== 'reject', decision, note,
        homeScore: s?.homeScore ?? null, awayScore: s?.awayScore ?? null, homePens: s?.homePens ?? null, awayPens: s?.awayPens ?? null,
      };
      await tx.disputeVote.upsert({ where: { disputeId_memberId: { disputeId, memberId: auth.userId } }, create: { disputeId, memberId: auth.userId, ...voteData }, update: voteData });
      await this.audit.record({ actorUserId: auth.userId, action: 'dispute.vote', entity: 'dispute', entityId: disputeId, payload: { matchId: m.id, ...voteData }, ip }, tx);

      const votes = await tx.disputeVote.findMany({ where: { disputeId }, orderBy: { createdAt: 'asc' } });
      const decided = tally(votes.map((v): Remedy => (v.decision === 'correct'
        ? { decision: 'correct', homeScore: v.homeScore!, awayScore: v.awayScore!, homePens: v.homePens, awayPens: v.awayPens }
        : { decision: v.decision as 'reject' | 'replay' })));
      if (!decided) return { decided: null, votes: votes.length };

      const now = new Date();
      const to = statusAfterDecision(decided.decision);
      let matchData: Prisma.MatchUncheckedUpdateManyInput;
      let removedEvents = 0;
      if (decided.decision === 'replay') {
        removedEvents = (await tx.matchEvent.deleteMany({ where: { matchId: m.id } })).count;
        matchData = {
          resultStatus: to, homeScore: null, awayScore: null, homePens: null, awayPens: null, homeConfirmed: false, awayConfirmed: false,
          resultEnteredAt: null, finalizedAt: null, sheetMediaId: null, sheetPhotoUrl: null, liveText: null,
        };
      } else if (decided.decision === 'correct') {
        matchData = { resultStatus: to, homeScore: decided.homeScore, awayScore: decided.awayScore, homePens: decided.homePens, awayPens: decided.awayPens, finalizedAt: now };
      } else {
        matchData = { resultStatus: to, finalizedAt: now };
      }
      const r = await tx.match.updateMany({ where: { id: m.id, resultStatus: 'disputed' }, data: matchData });
      if (!r.count) throw raced();
      const majorityNotes = votes.filter((v) => v.decision === decided.decision && v.note).map((v) => v.note);
      await tx.dispute.update({
        where: { id: disputeId },
        data: { status: decided.decision === 'reject' ? 'rejected' : 'upheld', decision: decided.decision, decisionNote: majorityNotes.join(' — ') || null, decidedAt: now },
      });
      await this.audit.record({
        actorUserId: auth.userId, action: 'dispute.decide', entity: 'dispute', entityId: disputeId,
        payload: { matchId: m.id, decision: decided, from: 'disputed', to, removedEvents, previous: { homeScore: m.homeScore, awayScore: m.awayScore, homePens: m.homePens, awayPens: m.awayPens }, voters: votes.map((v) => ({ memberId: v.memberId, decision: v.decision })) },
        ip,
      }, tx);
      const text = decided.decision === 'reject'
        ? `رفضت لجنة الانضباط الاعتراض، والنتيجة ${scoreLine(m, m as Score)} نهائية.`
        : decided.decision === 'correct'
          ? `قبلت لجنة الانضباط الاعتراض وصححت النتيجة إلى ${scoreLine(m, decided)} (نهائية).`
          : `قبلت لجنة الانضباط الاعتراض وقررت إعادة مباراة ${m.homeTeam.nameAr} و${m.awayTeam.nameAr}. يُعلن موعدها لاحقاً.`;
      await this.notifications.notify([m.refereeId, d.raisedById, ...(await this.managers([m.homeTeamId, m.awayTeamId], tx))], {
        titleAr: 'قرار لجنة الانضباط', bodyAr: `${text} — ${m.tournament.nameAr}`, data: { type: 'dispute.decided', matchId: m.id, disputeId, decision: decided.decision },
      }, tx);
      return { decided: decided.decision, votes: votes.length };
    });
    const d = await this.prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    return { dispute: { id: d.id, status: d.status, decision: d.decision, decisionNote: d.decisionNote, decidedAt: d.decidedAt }, ...outcome, match: resultState(await this.load(m.id)) };
  }

  // ───────────── صورة الورقة ─────────────

  /** GET /matches/:id/sheet — للحكم وإدارة البطولة ولجنة الانضباط ومديري الفريقين فقط */
  async sheet(id: number, auth: AuthContext) {
    const m = await this.load(id);
    const scope = { tournamentId: m.tournamentId };
    const sides = managedSides(auth, m);
    const allowed = m.refereeId === auth.userId || sides.home || sides.away
      || hasPermission(auth.grants, 'tournaments.manage', scope, auth.mfa) || hasPermission(auth.grants, 'disputes.decide', scope, auth.mfa);
    if (!allowed) throw new AppError(403, 'FORBIDDEN', 'صورة الورقة لأطراف المباراة وإدارتها فقط.');
    if (m.sheetMediaId === null) throw new AppError(404, 'SHEET_NOT_FOUND', 'لا توجد صورة ورقة لهذه المباراة.');
    return this.uploads.read(m.sheetMediaId);
  }

  // ───────────── مبارياتي (الحكم ومدير الفريق) ─────────────

  /** GET /me/matches — مباريات أحكمها، ونتائج تنتظر تأكيد فرقي */
  async mine(auth: AuthContext) {
    const teamIds = auth.grants.filter((g) => g.role === 'team_manager' && g.teamId != null).map((g) => g.teamId!);
    const [refereeing, pending] = await Promise.all([
      this.prisma.match.findMany({
        where: { refereeId: auth.userId, resultStatus: { in: ['scheduled', 'provisional'] }, tournament: { status: 'running' } },
        orderBy: [{ kickoffAt: 'asc' }, { id: 'asc' }], take: 50, include: MATCH_INCLUDE,
      }),
      teamIds.length
        ? this.prisma.match.findMany({
          where: { resultStatus: 'provisional', OR: [{ homeTeamId: { in: teamIds }, homeConfirmed: false }, { awayTeamId: { in: teamIds }, awayConfirmed: false }] },
          orderBy: [{ resultEnteredAt: 'asc' }, { id: 'asc' }], take: 50, include: MATCH_INCLUDE,
        })
        : Promise.resolve([] as LoadedMatch[]),
    ]);
    const view = (m: LoadedMatch) => ({ ...resultState(m), kickoffAt: m.kickoffAt, venue: m.venue, stage: m.stage, round: m.round, tournament: m.tournament, homeTeam: m.homeTeam, awayTeam: m.awayTeam });
    return { refereeing: refereeing.map(view), pendingConfirmation: pending.map(view) };
  }

  // ───────────── انتهاء المهلة تلقائياً ─────────────

  /** يجعل النتائج المؤقتة والمعتمدة نهائية بعد انتهاء نافذة الاعتراض. يعيد عدد المباريات. */
  async sweep(now = new Date()) {
    const due = await this.prisma.$queryRaw<{ id: number; result_status: string; result_entered_at: Date }[]>`
      SELECT m.id, m.result_status::text AS result_status, m.result_entered_at
      FROM matches m JOIN tournaments t ON t.id = m.tournament_id
      WHERE m.result_status IN ('provisional', 'confirmed')
        AND m.result_entered_at IS NOT NULL
        AND m.result_entered_at + make_interval(hours => t.dispute_window_hrs) <= ${now}
      ORDER BY m.id LIMIT 200`;
    let done = 0;
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        const from = row.result_status as 'provisional' | 'confirmed';
        // نفس وقت الإدخال: لو صحّح الحكم النتيجة في هذه اللحظة لا تُنهى
        const r = await tx.match.updateMany({ where: { id: row.id, resultStatus: from, resultEnteredAt: row.result_entered_at }, data: { resultStatus: 'final', finalizedAt: now } });
        if (!r.count) return;
        done++;
        const m = await this.load(row.id, tx);
        await this.audit.record({ actorUserId: null, action: 'match.auto_final', entity: 'match', entityId: row.id, payload: { from, to: 'final', windowHrs: m.tournament.disputeWindowHrs, homeConfirmed: m.homeConfirmed, awayConfirmed: m.awayConfirmed } }, tx);
        await this.notifications.notify([m.refereeId, ...(await this.managers([m.homeTeamId, m.awayTeamId], tx))], {
          titleAr: 'أصبحت النتيجة نهائية',
          bodyAr: `انتهت مهلة الاعتراض، ونتيجة ${scoreLine(m, m as Score)} نهائية — ${m.tournament.nameAr}.`,
          data: { type: 'result.final', matchId: row.id },
        }, tx);
      });
    }
    return done;
  }
}

@Controller()
@UseGuards(AuthGuard)
export class ResultsController {
  constructor(private readonly svc: ResultsService) {}

  @Post('matches/:id/result') @HttpCode(200)
  enter(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.enter(idParam(id, 'المباراة'), body, { auth: req.auth, ip: clientIp(req) });
  }

  @Post('matches/:id/confirm') @HttpCode(200)
  confirm(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.svc.confirm(idParam(id, 'المباراة'), { auth: req.auth, ip: clientIp(req) });
  }

  @Post('matches/:id/disputes')
  raise(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.raise(idParam(id, 'المباراة'), body, { auth: req.auth, ip: clientIp(req) });
  }

  @Get('matches/:id/sheet')
  async sheet(@Param('id') id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const f = await this.svc.sheet(idParam(id, 'المباراة'), req.auth);
    res.set({ 'content-type': f.mime, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }).send(f.data);
  }

  @Get('me/matches')
  mine(@Req() req: AuthedRequest) {
    return this.svc.mine(req.auth);
  }

  @Get('admin/disputes')
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.svc.list(req.auth, status);
  }

  @Post('admin/disputes/:id/vote') @HttpCode(200)
  vote(@Param('id') id: string, @Body() body: B, @Req() req: AuthedRequest) {
    return this.svc.vote(idParam(id, 'الاعتراض'), body, { auth: req.auth, ip: clientIp(req) });
  }
}
