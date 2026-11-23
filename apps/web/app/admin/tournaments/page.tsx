'use client';
import { useState } from 'react';
import {
  AGE_CATEGORIES, AGE_CATEGORY_LABELS, TOURNAMENT_FORMATS, TOURNAMENT_FORMAT_LABELS, TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, TOURNAMENT_STATUS_LABELS,
} from '@saha/shared';
import { useSession } from '@/components/auth';
import { Field, Loading, Note, PageHead, num, text, useAction, useLoad } from '@/components/admin/kit';
import type { AdminTournament } from '@/components/admin/types';
import { api } from '@/lib/client';
import { shortDate } from '@/lib/format';

const STATUS_BADGE: Record<string, string> = { draft: 's-scheduled', registration: 's-provisional', running: 's-confirmed', finished: 's-final', cancelled: 's-disputed' };

export default function AdminTournaments() {
  const s = useSession();
  const list = useLoad<AdminTournament[]>('/admin/tournaments');
  const [open, setOpen] = useState(false);
  const act = useAction();
  const canCreate = s.can('tournaments.manage');

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await act.run(async () => {
      const t = await api<{ id: number }>('/tournaments', {
        body: {
          nameAr: text(f.get('nameAr')), kind: f.get('kind'), format: f.get('format'), ageCategory: f.get('ageCategory'),
          slug: text(f.get('slug')), city: text(f.get('city')), startsOn: text(f.get('startsOn')), endsOn: text(f.get('endsOn')),
          maxTeams: num(f.get('maxTeams')), entryFeeIqd: num(f.get('entryFeeIqd')), disputeWindowHrs: num(f.get('disputeWindowHrs')),
          groupCount: num(f.get('groupCount')), qualifiersPerGroup: num(f.get('qualifiersPerGroup')), doubleRound: f.get('doubleRound') === 'on',
          communityId: num(f.get('communityId')),
        },
      });
      location.href = `/admin/tournaments/${t.id}`;
    });
    if (ok) setOpen(false);
  }

  return (
    <>
      <PageHead title="البطولات" text="أنشئ البطولة، اعتمد الفرق، أجرِ القرعة، ثم جدول المباريات.">
        {canCreate && <button type="button" className="btn btn-primary" onClick={() => setOpen(!open)}>{open ? 'إغلاق' : 'بطولة جديدة'}</button>}
      </PageHead>
      {open && (
        <form className="card form-card grid-form" onSubmit={create}>
          <Field label="اسم البطولة" wide><input name="nameAr" required minLength={3} maxLength={80} /></Field>
          <Field label="النوع"><select name="kind">{TOURNAMENT_KINDS.map((k) => <option key={k} value={k}>{TOURNAMENT_KIND_LABELS[k]}</option>)}</select></Field>
          <Field label="النظام"><select name="format">{TOURNAMENT_FORMATS.map((k) => <option key={k} value={k}>{TOURNAMENT_FORMAT_LABELS[k]}</option>)}</select></Field>
          <Field label="الفئة العمرية"><select name="ageCategory">{AGE_CATEGORIES.map((k) => <option key={k} value={k}>{AGE_CATEGORY_LABELS[k]}</option>)}</select></Field>
          <Field label="المدينة"><input name="city" maxLength={40} /></Field>
          <Field label="تاريخ البداية"><input name="startsOn" type="date" /></Field>
          <Field label="تاريخ النهاية"><input name="endsOn" type="date" /></Field>
          <Field label="الحد الأعلى للفرق"><input name="maxTeams" type="number" min={2} max={64} inputMode="numeric" /></Field>
          <Field label="رسوم الاشتراك (دينار)"><input name="entryFeeIqd" type="number" min={0} inputMode="numeric" /></Field>
          <Field label="نافذة الاعتراض (ساعات)" hint="الافتراضي 24"><input name="disputeWindowHrs" type="number" min={1} max={168} inputMode="numeric" /></Field>
          <Field label="عدد المجموعات" hint="لنظام المجموعات فقط"><input name="groupCount" type="number" min={1} max={8} inputMode="numeric" /></Field>
          <Field label="المتأهلون من كل مجموعة"><input name="qualifiersPerGroup" type="number" min={1} max={2} inputMode="numeric" /></Field>
          <Field label="رقم المجتمع المضيف" hint="للمؤثر أو المجموعة فقط"><input name="communityId" type="number" min={1} inputMode="numeric" /></Field>
          <Field label="الرابط المختصر" hint="أحرف إنجليزية صغيرة وشرطات، اختياري"><input name="slug" dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>
          <label className="check"><input type="checkbox" name="doubleRound" /> دوري ذهاب وإياب</label>
          <Note note={act.note} />
          <div className="row wide"><button className="btn btn-primary" disabled={act.busy}>إنشاء البطولة (مسودة)</button></div>
        </form>
      )}
      <Loading error={list.error} loading={list.loading} />
      {list.data && (
        <div className="card flush scroll-x">
          <table className="table admin-table">
            <thead><tr><th>#</th><th>البطولة</th><th>النوع</th><th>الحالة</th><th>الفرق</th><th>المباريات</th><th>البداية</th></tr></thead>
            <tbody>
              {list.data.length === 0 && <tr><td colSpan={7} className="muted">لا توجد بطولات بعد.</td></tr>}
              {list.data.map((t) => (
                <tr key={t.id}>
                  <td className="num">{t.id}</td>
                  <td><a href={`/admin/tournaments/${t.id}`}>{t.nameAr}</a></td>
                  <td>{TOURNAMENT_KIND_LABELS[t.kind]}</td>
                  <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{TOURNAMENT_STATUS_LABELS[t.status]}</span></td>
                  <td className="num">{t._count.registrations}{t.maxTeams ? ` / ${t.maxTeams}` : ''}</td>
                  <td className="num">{t._count.matches}</td>
                  <td>{shortDate(t.startsOn) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
