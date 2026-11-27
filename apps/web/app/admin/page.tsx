'use client';
import { useEffect, useState } from 'react';
import { TIMEZONE } from '@saha/shared';
import { useSession } from '@/components/auth';
import { NAV, NAV_GROUPS } from '@/components/admin/shell';
import { ConfirmButton, Note, PageHead, useAction } from '@/components/admin/kit';
import { AreaChart, Kpi, n0 } from '@/components/admin/charts';
import { AIcon, type AdminIconName } from '@/components/admin/icons';
import { api } from '@/lib/client';

interface Tile { key: string; label: string; href: string; icon: AdminIconName; value: number | null; sub: string; tone?: 'gold' | 'danger' | 'info' }
interface Pulse { totals: { impressions: number; clicks: number; ctr: number }; change: { impressions: number | null; clicks: number | null }; series: { day: string; impressions: number }[] }

const hello = () => {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'صباح الخير' : 'مساء الخير';
};

/** لوحة المؤشرات — ما ينتظر القرار، نبض الرعاة، والأقسام بحسب صلاحيات المستخدم */
export default function Dashboard() {
  const s = useSession();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [greet, setGreet] = useState('أهلاً');

  useEffect(() => {
    setGreet(hello());
    const jobs: [Tile, () => Promise<number>][] = [];
    const add = (t: Omit<Tile, 'value'>, fn: () => Promise<number>) => jobs.push([{ ...t, value: null }, fn]);
    const count = (p: string) => api<unknown[]>(p).then((r) => r.length);
    if (s.canSome('tournaments.manage')) {
      const tours = api<{ status: string; feesEnabled?: boolean; entryFeeIqd: number }[]>('/admin/tournaments');
      add({ key: 'running', label: 'بطولات جارية', sub: 'تُلعب الآن', icon: 'trophy', href: '/admin/tournaments' }, () => tours.then((r) => r.filter((t) => t.status === 'running').length));
      add({ key: 'reg', label: 'بالتسجيل', sub: 'تستقبل الفرق', icon: 'users', href: '/admin/tournaments', tone: 'info' }, () => tours.then((r) => r.filter((t) => t.status === 'registration').length));
      add({ key: 'fees', label: 'رسوم بانتظار القرار', sub: 'مبلغ مكتوب وغير مفعّل', icon: 'coins', href: '/admin/fees', tone: 'gold' }, () => tours.then((r) => r.filter((t) => (t.status === 'registration' || t.status === 'running') && !t.feesEnabled && t.entryFeeIqd > 0).length));
    }
    if (s.can('tournaments.manage')) add({ key: 'ver', label: 'طلبات توثيق', sub: 'فرق تنتظر', icon: 'shield', href: '/admin/verifications', tone: 'gold' }, () => count('/admin/verifications?status=pending'));
    if (s.canSome('results.enter')) add({ key: 'ref', label: 'مباريات تنتظر نتيجتي', sub: 'بصفتك حكماً', icon: 'whistle', href: '/admin/matches' }, () => api<{ refereeing: unknown[] }>('/me/matches').then((r) => r.refereeing.length));
    if (s.canSome('disputes.decide')) add({ key: 'disp', label: 'اعتراضات مفتوحة', sub: 'أمام لجنة الانضباط', icon: 'flag', href: '/admin/disputes', tone: 'danger' }, () => count('/admin/disputes?status=open'));
    if (s.canSome('content.publish') || s.canSome('content.draft') || s.canSome('slides.sponsor')) add({ key: 'slides', label: 'شرائح للمراجعة', sub: 'الهيرو سلايدر', icon: 'slides', href: '/admin/slides', tone: 'info' }, () => count('/admin/slides?status=review'));
    if (s.canSome('content.publish') || s.canSome('content.draft')) add({ key: 'posts', label: 'أخبار للمراجعة', sub: 'قبل النشر', icon: 'news', href: '/admin/posts', tone: 'info' }, () => count('/admin/posts?status=review'));
    if (s.canSome('sponsors.manage')) add({ key: 'leads', label: 'طلبات رعاية جديدة', sub: '«كن راعياً»', icon: 'handshake', href: '/admin/sponsors', tone: 'gold' }, () => count('/admin/sponsor-leads?status=new'));
    setTiles(jobs.map(([t]) => t));
    jobs.forEach(([t, fn]) => {
      fn().then((v) => setTiles((all) => all.map((x) => (x.key === t.key ? { ...x, value: v } : x)))).catch(() => undefined);
    });
    if (s.canSome('sponsor.reports.view')) {
      const to = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
      const from = new Date(Date.parse(`${to}T00:00:00Z`) - 13 * 86400_000).toISOString().slice(0, 10);
      api<Pulse>(`/admin/analytics/sponsors?from=${from}&to=${to}`).then(setPulse).catch(() => setPulse(null));
    }
  }, [s.me?.id]);

  const sections = NAV.filter((n) => n.href !== '/admin' && n.show(s));
  return (
    <>
      <PageHead title={`${greet}، ${s.me?.fullName.split(' ')[0] ?? ''}`} text="ما ينتظر قرارك الآن، ونبض الرعاة، ثم أقسام اللوحة المتاحة لدورك." />
      {tiles.length > 0 && (
        <div className="kpis">
          {tiles.map((t) => <Kpi key={t.key} icon={t.icon} label={t.label} value={t.value === null ? '…' : String(t.value)} sub={t.sub} tone={t.tone} href={t.href} />)}
        </div>
      )}

      {pulse && (
        <section className="card an-card">
          <div className="between">
            <h2>نبض الرعاة — آخر 14 يوماً</h2>
            <a href="/admin/analytics" className="btn btn-sm"><AIcon name="chart" size={18} /> التحليلات الكاملة</a>
          </div>
          <div className="row pulse-row">
            <span><span className="muted">الظهور</span> <b className="num">{n0(pulse.totals.impressions)}</b></span>
            <span><span className="muted">النقرات</span> <b className="num">{n0(pulse.totals.clicks)}</b></span>
            <span><span className="muted">نسبة النقر</span> <b className="num">{pulse.totals.ctr}%</b></span>
          </div>
          {pulse.totals.impressions > 0 ? <AreaChart points={pulse.series.map((p) => ({ x: p.day, y: p.impressions }))} label="مرات الظهور" /> : <p className="muted">لا ظهور لشرائح الرعاة في آخر 14 يوماً.</p>}
        </section>
      )}

      {s.me?.mfa && s.me.roles.some((r) => r.role === 'super_admin') && <Showcase />}

      {NAV_GROUPS.map((g) => {
        const list = sections.filter((n) => n.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="admin-sec">
            <h2 className="admin-h2">{g}</h2>
            <div className="quick-grid">
              {list.map((n) => <a key={n.href} href={n.href} className="card quick"><span className="kpi-ico"><AIcon name={n.icon} /></span><b>{n.label}</b></a>)}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** بيانات العرض: 5 بطولات وهمية تُظهر كل خصائص المنصة، تُنشأ وتُحذف بضغطة (المدير العام فقط) */
function Showcase() {
  const [st, setSt] = useState<{ exists: boolean; tournaments: number } | null>(null);
  const act = useAction();
  const load = () => api<{ exists: boolean; tournaments: number }>('/admin/demo/showcase').then(setSt).catch(() => setSt(null));
  useEffect(() => { void load(); }, []);
  if (!st) return null;
  return (
    <div className="card form-card">
      <div className="between wrap-row">
        <b>بيانات العرض التجريبية</b>
        <span className={`badge ${st.exists ? 's-confirmed' : 's-scheduled'}`}>{st.exists ? `موجودة — ${st.tournaments} بطولات` : 'غير موجودة'}</span>
      </div>
      <p className="muted">خمس بطولات وهمية تُظهر كل خصائص المنصة: خروج المغلوب منتهٍ بشجرة كاملة، دوري منتهٍ، مجموعات ثم خروج المغلوب بمباراة مباشرة اليوم، دوري جارٍ، وبطولة بالتسجيل — مع الهدافين وأفضل اللاعبين والجوائز بكل حالاتها وسجل الجوائز وأخبار. الحذف يزيلها وحدها ولا يمس أي بيانات أخرى.</p>
      <div className="row">
        {!st.exists && <ConfirmButton className="btn btn-gold" disabled={act.busy} confirm="إنشاء 5 بطولات وهمية بفرقها ومبارياتها وجوائزها؟" onClick={() => void act.run(async () => { await api('/admin/demo/showcase', { method: 'POST' }); await load(); }, 'أُنشئت بيانات العرض. افتح الرئيسية أو صفحة «الجوائز» لتراها.')}>{act.busy ? 'جارٍ الإنشاء…' : 'أنشئ بيانات العرض'}</ConfirmButton>}
        {st.exists && <a className="btn btn-sm" href="/tournaments" target="_blank" rel="noopener noreferrer">البطولات</a>}
        {st.exists && <a className="btn btn-sm" href="/prizes" target="_blank" rel="noopener noreferrer">سجل الجوائز</a>}
        {st.exists && <ConfirmButton disabled={act.busy} confirm="حذف كل بيانات العرض (البطولات الخمس وفرقها وأخبارها)؟" onClick={() => void act.run(async () => { await api('/admin/demo/showcase', { method: 'DELETE' }); await load(); }, 'حُذفت بيانات العرض.')}>احذف بيانات العرض</ConfirmButton>}
      </div>
      <Note note={act.note} />
    </div>
  );
}

