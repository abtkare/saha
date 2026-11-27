/**
 * المباراة: النتيجة وحالتها والأحداث، و«أكّد النتيجة» أو «اعترض» لمديري الفريقين، و«أدخل النتيجة» للحكم.
 * إدخال النتيجة: الأهداف (والترجيح في خروج المغلوب)، صورة ورقة المباراة بالكاميرا، الأحداث، والنتيجة النصية أثناء المباراة.
 */
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LIVE_TEXT_MAX, MATCH_EVENT_LABELS, MATCH_EVENT_TYPES, RESULT_STATUS_LABELS, STAGE_LABELS, TOURNAMENT_KIND_LABELS, type MatchEventType, type ResultStatus } from '@saha/shared';
import { api, uploadImage } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/icons';
import { HeroBlock, LivePanel, TopBar } from '../components/layout';
import { Button, Card, Chip, Crest, Empty, ErrorBox, Field, Loading, Notice, ScrollPage, Section, StatusBadge, Tabs, Divider } from '../components/ui';
import { dateTime, isKnockout, kickoffTime, scoreText } from '../format';
import { errMsg, useLoad } from '../hooks';
import { useNav } from '../nav';
import { radius, row, start, T, useTheme } from '../theme';
import type { MatchDetail, MyMatch, TeamDetail } from '../types';

const STATUS_HELP: Record<ResultStatus, string> = {
  scheduled: 'لم تُدخل النتيجة بعد.',
  provisional: 'أدخلها الحكم، وتنتظر تأكيد مديري الفريقين أو انتهاء مهلة الاعتراض.',
  confirmed: 'أكّدها مديرا الفريقين، وتصبح نهائية بانتهاء المهلة.',
  disputed: 'عليها اعتراض أمام لجنة الانضباط، ولا تدخل الترتيب حتى تُحسم.',
  final: 'نتيجة نهائية محسوبة في الترتيب.',
};
const EVENT_ICON: Record<MatchEventType, string> = { goal: '⚽', own_goal: '⚽', yellow_card: '🟨', red_card: '🟥', mvp: '★' };

export function MatchScreen({ id }: { id: number }) {
  const { c } = useTheme();
  const { push } = useNav();
  const { me, teams, reloadUnread } = useAuth();
  const [disputing, setDisputing] = useState(false);
  const page = useLoad(async () => {
    const m = await api<MatchDetail>(`/matches/${id}`);
    const mine = me ? await api<{ refereeing: MyMatch[] }>('/me/matches').catch(() => null) : null;
    return { m, referee: !!mine?.refereeing.some((x) => x.id === id) };
  }, [id, me?.id]);
  const d = page.data;
  const m = d?.m;

  const myTeamIds = new Set(teams.map((t) => t.id));
  const side = m ? (myTeamIds.has(m.homeTeam.id) ? 'home' : myTeamIds.has(m.awayTeam.id) ? 'away' : null) : null;
  const confirmedBySide = m && side ? (side === 'home' ? m.homeConfirmed : m.awayConfirmed) : false;
  const canConfirm = !!m && !!side && m.resultStatus === 'provisional' && !confirmedBySide;
  const canDispute = !!m && !!side && (m.resultStatus === 'provisional' || m.resultStatus === 'confirmed');

  const confirm = async () => {
    try {
      await api(`/matches/${id}/confirm`, { method: 'POST' });
      Alert.alert('تم التأكيد', 'سجّلنا تأكيد فريقك للنتيجة.');
      await page.reload();
      void reloadUnread();
    } catch (e) { Alert.alert('لم يُسجَّل التأكيد', errMsg(e)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar hero title={m ? `${m.homeTeam.nameAr} × ${m.awayTeam.nameAr}` : 'المباراة'} />
      <ScrollPage onRefresh={page.refresh} refreshing={page.refreshing}>
        {page.loading && !d ? <Loading /> : page.error || !m ? <View style={{ padding: 16 }}><ErrorBox message={page.error ?? 'المباراة غير موجودة.'} onRetry={page.refresh} /></View> : (
          <>
            <HeroBlock pad={16}>
              <Pressable onPress={() => push({ name: 'tournament', slug: m.tournament.slug })} accessibilityRole="link">
                <T v="smallB" color="#DCEDE6" center>{[m.tournament.nameAr, m.round ? `الجولة ${m.round}` : STAGE_LABELS[m.stage] ?? ''].filter(Boolean).join(' · ')}</T>
              </Pressable>
              <LivePanel>
                <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
                  <T v="small" muted>{TOURNAMENT_KIND_LABELS[m.tournament.kind]}</T>
                  <StatusBadge status={m.resultStatus} label={m.resultStatus === 'scheduled' ? RESULT_STATUS_LABELS.scheduled : `نتيجة ${RESULT_STATUS_LABELS[m.resultStatus]}`} />
                </View>
                <View style={{ flexDirection: row, alignItems: 'center' }}>
                  <TeamBig name={m.homeTeam.nameAr} logo={m.homeTeam.logoUrl} onPress={() => push({ name: 'team', id: m.homeTeam.id })} ok={m.resultStatus !== 'scheduled' && m.homeConfirmed} />
                  <T v="num" size={44} center style={{ flex: 1, lineHeight: 52 }}>{scoreText(m)}</T>
                  <TeamBig name={m.awayTeam.nameAr} logo={m.awayTeam.logoUrl} onPress={() => push({ name: 'team', id: m.awayTeam.id })} ok={m.resultStatus !== 'scheduled' && m.awayConfirmed} />
                </View>
                {m.homePens !== null && m.awayPens !== null && <T v="smallB" center>{`ركلات الترجيح ${m.homePens} – ${m.awayPens}`}</T>}
                <Scorers m={m} />
                {m.resultStatus === 'scheduled' && m.liveText ? <Notice tone="ok">{m.liveText}</Notice> : null}
                <View style={{ flexDirection: row, justifyContent: 'center', gap: 16, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, flexWrap: 'wrap' }}>
                  <T v="small" muted>{dateTime(m.kickoffAt) || 'الموعد لاحقاً'}</T>
                  {m.venue ? <T v="small" muted>{m.venue}</T> : null}
                </View>
              </LivePanel>
            </HeroBlock>

            <Section title="حالة النتيجة">
              <Card style={{ padding: 16, gap: 10 }}>
                <T>{STATUS_HELP[m.resultStatus]}</T>
                {m.disputeDeadline && <T v="small" muted>{`مهلة الاعتراض حتى ${dateTime(m.disputeDeadline)}`}</T>}
                {m.resultStatus !== 'scheduled' && (
                  <T v="small" muted>{`تأكيد ${m.homeTeam.nameAr}: ${m.homeConfirmed ? 'نعم' : 'لا'} · تأكيد ${m.awayTeam.nameAr}: ${m.awayConfirmed ? 'نعم' : 'لا'}`}</T>
                )}
                {m.disputes.length > 0 && <Chip tone="danger">{`اعتراضات: ${m.disputes.length}`}</Chip>}
              </Card>
              {canConfirm && <Button title="أكّد النتيجة" icon="check" onPress={confirm} />}
              {canDispute && <Button title="اعترض" kind="secondary" icon="flag" onPress={() => setDisputing(true)} />}
              {side && confirmedBySide && m.resultStatus === 'provisional' && <Notice tone="ok">أكّد فريقك النتيجة، وننتظر تأكيد الفريق الآخر.</Notice>}
              {d.referee && (m.resultStatus === 'scheduled' || m.resultStatus === 'provisional') && (
                <Button title={m.resultStatus === 'scheduled' ? 'أدخل النتيجة' : 'صحّح النتيجة'} kind="gold" icon="whistle" onPress={() => push({ name: 'result', id: m.id })} />
              )}
            </Section>

            <Section title="إحصائيات">
              <StatCompare m={m} />
            </Section>

            <Section title="مجريات المباراة">
              {m.events.length ? <Timeline m={m} /> : <Empty>لا أحداث مسجّلة.</Empty>}
            </Section>
          </>
        )}
      </ScrollPage>
      {m && <DisputeSheet visible={disputing} matchId={m.id} onClose={() => setDisputing(false)} onDone={() => { setDisputing(false); void page.reload(); }} />}
    </View>
  );
}

function TeamBig({ name, logo, onPress, ok }: { name: string; logo?: string | null; onPress: () => void; ok: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View>
        <Crest name={name} uri={logo} size={64} />
        {ok && <View style={{ position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={12} color="#FFFFFF" width={3} /></View>}
      </View>
      <T v="bodyB" center numberOfLines={2}>{name}</T>
    </Pressable>
  );
}

type Side = 'home' | 'away';
const rowRev = row === 'row' ? 'row-reverse' : 'row';
const endAlign = start === 'flex-start' ? 'flex-end' : 'flex-start';
const sideOf = (m: MatchDetail, teamId: number): Side => (teamId === m.homeTeam.id ? 'home' : 'away');
const sortedEvents = (m: MatchDetail) => [...m.events].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || a.id - b.id);
const scorersOf = (m: MatchDetail, s: Side) => sortedEvents(m).filter((e) => (e.type === 'goal' && sideOf(m, e.teamId) === s) || (e.type === 'own_goal' && sideOf(m, e.teamId) !== s));
const mins = (v: number | null) => (v !== null ? `${v}'` : '');

/** الهدافون تحت النتيجة: كل فريق في جهته */
function Scorers({ m }: { m: MatchDetail }) {
  const h = scorersOf(m, 'home'), a = scorersOf(m, 'away');
  if (!h.length && !a.length) return null;
  const col = (list: typeof h) => (
    <View style={{ flex: 1, gap: 2 }}>
      {list.map((e) => <T key={e.id} v="small" muted center numberOfLines={1}>{`${e.player?.name ?? 'هدف'}${e.type === 'own_goal' ? ' (عكسي)' : ''} ${mins(e.minute)}`}</T>)}
    </View>
  );
  return <View style={{ flexDirection: row, gap: 12 }}>{col(h)}<View style={{ width: 20, alignItems: 'center' }}><T size={14}>⚽</T></View>{col(a)}</View>;
}

/** مقارنة إحصائية بأشرطة: الأهداف والبطاقات، وأفضل لاعب */
function StatCompare({ m }: { m: MatchDetail }) {
  const { c } = useTheme();
  const count = (s: Side, t: MatchEventType) => m.events.filter((e) => e.type === t && sideOf(m, e.teamId) === s).length;
  const rows: [string, number, number][] = [
    ['الأهداف', m.homeScore ?? scorersOf(m, 'home').length, m.awayScore ?? scorersOf(m, 'away').length],
    ['البطاقات الصفراء', count('home', 'yellow_card'), count('away', 'yellow_card')],
    ['البطاقات الحمراء', count('home', 'red_card'), count('away', 'red_card')],
  ];
  const mvp = m.events.find((e) => e.type === 'mvp');
  return (
    <Card style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 8, flex: 1 }}><Crest name={m.homeTeam.nameAr} uri={m.homeTeam.logoUrl} size={28} /><T v="smallB" numberOfLines={1} style={{ flexShrink: 1 }}>{m.homeTeam.nameAr}</T></View>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 8, flex: 1, justifyContent: endAlign }}><T v="smallB" numberOfLines={1} style={{ flexShrink: 1 }}>{m.awayTeam.nameAr}</T><Crest name={m.awayTeam.nameAr} uri={m.awayTeam.logoUrl} size={28} /></View>
      </View>
      {rows.map(([label, h, a]) => {
        const total = h + a || 1;
        return (
          <View key={label} style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${m.homeTeam.nameAr} ${h}، ${m.awayTeam.nameAr} ${a}`}>
            <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="num" size={18}>{String(h)}</T><T v="small" muted>{label}</T><T v="num" size={18}>{String(a)}</T>
            </View>
            <View style={{ flexDirection: row, gap: 4, height: 8 }}>
              <View style={{ width: `${(h / total) * 100}%` as const, minWidth: 4, borderRadius: 4, backgroundColor: c.primary }} />
              <View style={{ flex: 1 }} />
              <View style={{ width: `${(a / total) * 100}%` as const, minWidth: 4, borderRadius: 4, backgroundColor: '#F2B705' }} />
            </View>
          </View>
        );
      })}
      {mvp && <><Divider /><T v="small">{`★ أفضل لاعب: ${mvp.player?.name ?? '—'} · ${sideOf(m, mvp.teamId) === 'home' ? m.homeTeam.nameAr : m.awayTeam.nameAr}`}</T></>}
    </Card>
  );
}

/** خط زمني بجهتين: أحداث المضيف يميناً والضيف يساراً، والدقيقة في المنتصف */
function Timeline({ m }: { m: MatchDetail }) {
  const { c } = useTheme();
  return (
    <Card style={{ paddingVertical: 8 }}>
      <View style={{ position: 'absolute', top: 12, bottom: 12, left: '50%', width: 2, marginLeft: -1, backgroundColor: c.line }} />
      {sortedEvents(m).map((e) => {
        const s = sideOf(m, e.teamId);
        const ev = (
          <View style={{ flexDirection: s === 'home' ? row : rowRev, alignItems: 'center', gap: 8, backgroundColor: c.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, maxWidth: '100%' }}>
            <EventMark type={e.type} />
            <View style={{ flexShrink: 1 }}>
              <T v="smallB" numberOfLines={1}>{e.player?.name ?? MATCH_EVENT_LABELS[e.type]}</T>
              <T v="tiny" muted>{MATCH_EVENT_LABELS[e.type]}</T>
            </View>
          </View>
        );
        return (
          <View key={e.id} style={{ flexDirection: row, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5 }}
            accessible accessibilityLabel={`${mins(e.minute)} ${MATCH_EVENT_LABELS[e.type]}${e.player ? ` — ${e.player.name}` : ''} · ${s === 'home' ? m.homeTeam.nameAr : m.awayTeam.nameAr}`}>
            <View style={{ flex: 1, alignItems: start }}>{s === 'home' ? ev : null}</View>
            <View style={{ width: 48, height: 28, borderRadius: 14, borderWidth: 2, borderColor: c.primary, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 }}>
              <T v="num" size={12} color={c.primary}>{mins(e.minute) || '—'}</T>
            </View>
            <View style={{ flex: 1, alignItems: endAlign }}>{s === 'away' ? ev : null}</View>
          </View>
        );
      })}
    </Card>
  );
}

/** رمز الحدث: بطاقة ملوّنة مرسومة، أو رمز */
function EventMark({ type }: { type: MatchEventType }) {
  if (type === 'yellow_card' || type === 'red_card') {
    return <View style={{ width: 12, height: 16, borderRadius: 2, backgroundColor: type === 'red_card' ? '#D7263D' : '#F2C200' }} />;
  }
  return <T size={16}>{EVENT_ICON[type]}</T>;
}

/** ورقة الاعتراض: السبب (10 أحرف على الأقل) */
function DisputeSheet({ visible, matchId, onClose, onDone }: { visible: boolean; matchId: number; onClose: () => void; onDone: () => void }) {
  const { c } = useTheme();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    if (reason.trim().length < 10) { setError('اكتب سبب الاعتراض في 10 أحرف على الأقل.'); return; }
    try {
      await api(`/matches/${matchId}/disputes`, { method: 'POST', body: { reason: reason.trim() } });
      setReason('');
      Alert.alert('وصل اعتراضك', 'النتيجة الآن «متنازع عليها» حتى تبت لجنة الانضباط. يصلك إشعار بالقرار.');
      onDone();
    } catch (e) { setError(errMsg(e)); }
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 14 }}>
          <T v="h2">اعترض على النتيجة</T>
          <T v="small" muted>يصل الاعتراض للجنة الانضباط (3 أعضاء)، والقرار بأغلبية صوتين. لا تدخل النتيجة الترتيب حتى يُحسم.</T>
          <Field label="سبب الاعتراض" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="مثال: الهدف الثاني سُجّل بعد صافرة النهاية" error={error} />
          <Button title="أرسل الاعتراض" kind="danger" icon="flag" onPress={send} />
          <Button title="إلغاء" kind="light" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** لوحة الحكم: إدخال النتيجة وصورة الورقة والأحداث والنتيجة النصية */
export function ResultScreen({ id }: { id: number }) {
  const { c } = useTheme();
  const { pop } = useNav();
  const page = useLoad(async () => {
    const m = await api<MatchDetail>(`/matches/${id}`);
    const [home, away] = await Promise.all([api<TeamDetail>(`/teams/${m.homeTeam.id}`), api<TeamDetail>(`/teams/${m.awayTeam.id}`)]);
    return { m, home, away };
  }, [id]);
  const d = page.data;
  const [score, setScore] = useState<{ h: number; a: number; hp: number; ap: number } | null>(null);
  const [sheet, setSheet] = useState<{ uri: string; id: number | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const [tab, setTab] = useState<'result' | 'events' | 'live'>('result');

  if (page.loading && !d) return <View style={{ flex: 1, backgroundColor: c.bg }}><TopBar title="إدخال النتيجة" /><Loading /></View>;
  if (!d) return <View style={{ flex: 1, backgroundColor: c.bg }}><TopBar title="إدخال النتيجة" /><View style={{ padding: 16 }}><ErrorBox message={page.error ?? ''} onRetry={page.refresh} /></View></View>;
  const m = d.m;
  const s = score ?? { h: m.homeScore ?? 0, a: m.awayScore ?? 0, hp: m.homePens ?? 0, ap: m.awayPens ?? 0 };
  const ko = isKnockout(m.stage);
  const needPens = ko && s.h === s.a;
  const started = !!m.kickoffAt && new Date(m.kickoffAt) <= new Date();

  const pick = async (camera: boolean) => {
    setError(null);
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError(camera ? 'اسمح للتطبيق باستخدام الكاميرا من إعدادات الهاتف.' : 'اسمح للتطبيق بالوصول إلى الصور من إعدادات الهاتف.'); return; }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, allowsEditing: false };
      const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const uri = r.assets[0].uri;
      setSheet({ uri, id: null });
      setUploading(true);
      const up = await uploadImage(uri, 'private');
      setSheet({ uri, id: up.id });
    } catch (e) {
      setSheet(null);
      setError(errMsg(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!sheet?.id && !m.hasSheet) { setError('صوّر ورقة المباراة أولاً.'); return; }
    try {
      await api(`/matches/${id}/result`, {
        method: 'POST',
        body: { homeScore: s.h, awayScore: s.a, ...(needPens ? { homePens: s.hp, awayPens: s.ap } : {}), ...(sheet?.id ? { sheetMediaId: sheet.id } : {}) },
      });
      Alert.alert('أُدخلت النتيجة', 'النتيجة الآن «مؤقتة»، ووصل لمديري الفريقين إشعار لتأكيدها.');
      pop();
    } catch (e) { setError(errMsg(e)); }
  };

  const sendLive = async () => {
    setError(null);
    try {
      await api(`/matches/${id}/live`, { method: 'PATCH', body: { text: live.trim() } });
      Alert.alert('حُدّثت النتيجة النصية', 'تظهر في شريحة «مباراة اليوم» خلال 30 ثانية.');
      setLive('');
    } catch (e) { setError(errMsg(e)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar title={`${m.homeTeam.nameAr} × ${m.awayTeam.nameAr}`} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Tabs items={[{ key: 'result', label: 'النتيجة' }, { key: 'events', label: 'الأحداث' }, { key: 'live', label: 'أثناء المباراة' }]} value={tab} onChange={setTab} />
          {error && <Notice tone="error">{error}</Notice>}

          {tab === 'result' && (
            <>
              {!started && <Notice tone="warn">{`لا تُدخل النتيجة قبل موعد الانطلاق (${kickoffTime(m.kickoffAt)}).`}</Notice>}
              <Card style={{ padding: 16, gap: 16 }}>
                <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                  <Stepper label={m.homeTeam.nameAr} value={s.h} onChange={(h) => setScore({ ...s, h })} />
                  <T v="num" size={28} muted>–</T>
                  <Stepper label={m.awayTeam.nameAr} value={s.a} onChange={(a) => setScore({ ...s, a })} />
                </View>
                {needPens && (
                  <>
                    <Divider />
                    <T v="smallB" center>ركلات الترجيح (خروج المغلوب)</T>
                    <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                      <Stepper label={m.homeTeam.nameAr} value={s.hp} onChange={(hp) => setScore({ ...s, hp })} small />
                      <T v="num" size={22} muted>–</T>
                      <Stepper label={m.awayTeam.nameAr} value={s.ap} onChange={(ap) => setScore({ ...s, ap })} small />
                    </View>
                  </>
                )}
              </Card>

              <Card style={{ padding: 16, gap: 12 }}>
                <T v="h3">صورة ورقة المباراة</T>
                {sheet ? (
                  <View style={{ borderRadius: radius.sm, overflow: 'hidden' }}>
                    <Image source={{ uri: sheet.uri }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
                    {uploading && <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}><T color="#FFFFFF">جارٍ الرفع…</T></View>}
                  </View>
                ) : m.hasSheet ? <Notice tone="ok">صورة الورقة مرفوعة سابقاً. يمكنك تصوير ورقة جديدة.</Notice> : <T v="small" muted>مطلوبة مع النتيجة. صوّرها كاملة وواضحة.</T>}
                <View style={{ flexDirection: row, gap: 8 }}>
                  <Button title="صوّر الورقة" icon="camera" kind="secondary" small style={{ flex: 1 }} onPress={() => pick(true)} disabled={uploading} />
                  <Button title="من الصور" icon="image" kind="light" small style={{ flex: 1 }} onPress={() => pick(false)} disabled={uploading} />
                </View>
              </Card>

              <Button title={m.resultStatus === 'provisional' ? 'صحّح النتيجة' : 'أرسل النتيجة'} icon="check" onPress={submit} disabled={uploading || !started} />
              <T v="small" muted center>بعد الإرسال تصبح النتيجة «مؤقتة» حتى يؤكدها مديرا الفريقين أو تنتهي مهلة الاعتراض.</T>
            </>
          )}

          {tab === 'events' && <EventsEditor m={m} home={d.home} away={d.away} onChange={page.reload} onError={setError} />}

          {tab === 'live' && (
            <Card style={{ padding: 16, gap: 12 }}>
              <T v="h3">النتيجة النصية</T>
              <T v="small" muted>تظهر في شريحة «مباراة اليوم» على الرئيسية أثناء المباراة، قبل إدخال النتيجة الرسمية.</T>
              {m.liveText ? <Notice tone="ok">{`الآن: ${m.liveText}`}</Notice> : null}
              <Field label="النص" value={live} onChangeText={setLive} maxLength={LIVE_TEXT_MAX} placeholder="مثال: الشوط الثاني — 1 – 0" />
              <Button title="حدّث" icon="refresh" onPress={sendLive} disabled={!live.trim() || m.resultStatus !== 'scheduled'} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Stepper({ label, value, onChange, small }: { label: string; value: number; onChange: (v: number) => void; small?: boolean }) {
  const { c } = useTheme();
  const btn = (name: 'plus' | 'minus', d: number) => (
    <Pressable onPress={() => onChange(Math.max(0, Math.min(99, value + d)))} accessibilityRole="button" accessibilityLabel={`${d > 0 ? 'زد' : 'أنقص'} أهداف ${label}`}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.tint : c.surface, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={name} size={20} color={c.primary} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <T v="smallB" center numberOfLines={2}>{label}</T>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
        {btn('plus', 1)}
        <T v="num" size={small ? 26 : 36} center style={{ minWidth: 40 }} accessibilityLabel={`${value}`}>{value}</T>
        {btn('minus', -1)}
      </View>
    </View>
  );
}

function EventsEditor({ m, home, away, onChange, onError }: { m: MatchDetail; home: TeamDetail; away: TeamDetail; onChange: () => Promise<void>; onError: (e: string | null) => void }) {
  const { c } = useTheme();
  const [type, setType] = useState<MatchEventType>('goal');
  const [teamId, setTeamId] = useState(m.homeTeam.id);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [minute, setMinute] = useState('');
  // الهدف العكسي: الفريق المستفيد، واللاعب من الفريق المنافس
  const playerTeam = type === 'own_goal' ? (teamId === home.id ? away : home) : teamId === home.id ? home : away;

  const add = async () => {
    onError(null);
    try {
      await api(`/matches/${m.id}/events`, { method: 'POST', body: { type, teamId, ...(playerId ? { playerId } : {}), ...(minute ? { minute: Number(minute) } : {}) } });
      setPlayerId(null); setMinute('');
      await onChange();
    } catch (e) { onError(errMsg(e)); }
  };
  const remove = (eventId: number) => Alert.alert('حذف الحدث؟', undefined, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'احذف', style: 'destructive', onPress: async () => { try { await api(`/matches/${m.id}/events/${eventId}`, { method: 'DELETE' }); await onChange(); } catch (e) { onError(errMsg(e)); } } },
  ]);

  return (
    <>
      <Card style={{ padding: 16, gap: 12 }}>
        <T v="h3">أضف حدثاً</T>
        <ChipPicker items={MATCH_EVENT_TYPES.map((t) => ({ key: t, label: MATCH_EVENT_LABELS[t] }))} value={type} onChange={(t) => { setType(t); setPlayerId(null); }} />
        <Tabs items={[{ key: String(home.id), label: home.nameAr }, { key: String(away.id), label: away.nameAr }]} value={String(teamId)} onChange={(k) => { setTeamId(Number(k)); setPlayerId(null); }} />
        <T v="smallB">{type === 'own_goal' ? `اللاعب (من ${playerTeam.nameAr})` : 'اللاعب'}</T>
        {playerTeam.players.length ? (
          <ChipPicker items={playerTeam.players.map((p) => ({ key: p.id, label: p.shirtNo ? `${p.shirtNo} · ${p.name}` : p.name }))} value={playerId} onChange={setPlayerId} />
        ) : <T v="small" muted>لا لاعبين في قائمة الفريق.</T>}
        <Field label="الدقيقة (اختياري)" value={minute} onChangeText={(v) => setMinute(v.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" />
        <Button title="أضف" icon="plus" onPress={add} />
      </Card>
      <Section title="المسجّلة" padded={false} style={{ paddingTop: 8 }}>
        {m.events.length ? (
          <Card flush>
            {m.events.map((e, i) => (
              <View key={e.id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: row, alignItems: 'center', gap: 10, padding: 12 }}>
                  <T size={18}>{EVENT_ICON[e.type]}</T>
                  <View style={{ flex: 1 }}>
                    <T v="bodyB">{`${MATCH_EVENT_LABELS[e.type]}${e.player ? ` — ${e.player.name}` : ''}`}</T>
                    <T v="small" muted>{`${e.teamId === home.id ? home.nameAr : away.nameAr}${e.minute !== null ? ` · الدقيقة ${e.minute}` : ''}`}</T>
                  </View>
                  {m.resultStatus !== 'final' && m.resultStatus !== 'disputed' && (
                    <Pressable onPress={() => remove(e.id)} accessibilityRole="button" accessibilityLabel="احذف الحدث" hitSlop={8}><Icon name="trash" size={20} color={c.danger} /></Pressable>
                  )}
                </View>
              </View>
            ))}
          </Card>
        ) : <Empty>لا أحداث بعد.</Empty>}
      </Section>
    </>
  );
}

/** اختيار واحد من شارات */
export function ChipPicker<K extends string | number>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K | null; onChange: (k: K) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Pressable key={String(it.key)} onPress={() => onChange(it.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.surface, justifyContent: 'center' }}>
            <T v="smallB" color={on ? c.onPrimary : c.ink}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
