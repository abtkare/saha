'use client';
import { useState } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@saha/shared';
import { ConfirmButton, Field, Loading, Note, PageHead, num, useAction, useLoad } from '@/components/admin/kit';
import type { AdminUser } from '@/components/admin/types';
import { api } from '@/lib/client';

const STATUS: Record<string, string> = { active: 'فعّال', pending_guardian: 'بانتظار ولي الأمر', suspended: 'موقوف', deleted: 'محذوف' };
const scopeOf = (r: AdminUser['roles'][number]) => [r.tournamentId && `بطولة ${r.tournamentId}`, r.teamId && `فريق ${r.teamId}`, r.sponsorId && `راعٍ ${r.sponsorId}`].filter(Boolean).join(' · ');

/** المستخدمون والأدوار — منح دور (بنطاق بطولة أو فريق أو راعٍ) أو سحبه */
export default function Users() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const list = useLoad<AdminUser[]>(`/admin/users${term ? `?q=${encodeURIComponent(term)}` : ''}`);
  const act = useAction();
  const [role, setRole] = useState<Record<number, Role>>({});

  return (
    <>
      <PageHead title="المستخدمون والأدوار" text="ابحث بالاسم أو الهاتف أو البريد. أدوار المدير العام ومحرر المحتوى ومدير الرعاة تعمل بدخول البريد ورمز التحقق فقط." />
      <form className="row search" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم، أو 0770…، أو بريد" aria-label="بحث" />
        <button className="btn btn-primary">بحث</button>
      </form>
      <Note note={act.note} />
      <Loading error={list.error} loading={list.loading} />
      <div className="stack">
        {list.data?.length === 0 && <div className="card empty-card">لا نتائج.</div>}
        {list.data?.map((u) => {
          const r = role[u.id] ?? 'referee';
          return (
            <details key={u.id} className="card panel">
              <summary>
                <b>{u.fullName}</b><span className="muted" dir="ltr">{u.phone ?? u.email ?? ''}</span>
                <span className="badge s-scheduled">{STATUS[u.status] ?? u.status}</span>
                {u.roles.map((x) => <span key={x.id} className="badge s-confirmed">{ROLE_LABELS[x.role as Role]}</span>)}
              </summary>
              <ul className="plain-list">
                {u.roles.map((x) => (
                  <li key={x.id} className="between">
                    <span>{ROLE_LABELS[x.role as Role]} <span className="muted">{scopeOf(x) || 'كل النطاقات'}</span></span>
                    <ConfirmButton className="btn btn-sm btn-danger" disabled={act.busy} confirm={`سحب دور «${ROLE_LABELS[x.role as Role]}»؟`} onClick={() => void act.run(async () => { await api(`/admin/users/${u.id}/roles/${x.id}`, { method: 'DELETE' }); await list.reload(); }, 'سُحب الدور.')}>سحب</ConfirmButton>
                  </li>
                ))}
              </ul>
              {u.status === 'active' && (
                <form className="grid-form" onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act.run(async () => {
                    await api(`/admin/users/${u.id}/roles`, { body: { role: r, tournamentId: num(f.get('tournamentId')), teamId: num(f.get('teamId')), sponsorId: num(f.get('sponsorId')) } });
                    await list.reload();
                  }, 'مُنح الدور.');
                }}>
                  <Field label="منح دور"><select value={r} onChange={(e) => setRole({ ...role, [u.id]: e.target.value as Role })}>{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</select></Field>
                  {r !== 'super_admin' && r !== 'sponsor_viewer' && <Field label="رقم البطولة" hint="اختياري لتقييد الدور"><input name="tournamentId" type="number" min={1} /></Field>}
                  {r === 'team_manager' && <Field label="رقم الفريق"><input name="teamId" type="number" min={1} required /></Field>}
                  {r === 'sponsor_viewer' && <Field label="رقم الراعي"><input name="sponsorId" type="number" min={1} required /></Field>}
                  <div className="row wide"><button className="btn btn-primary btn-sm" disabled={act.busy}>منح</button></div>
                </form>
              )}
            </details>
          );
        })}
      </div>
    </>
  );
}
