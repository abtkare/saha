'use client';
import { useRef, useState } from 'react';
import { AIcon, type AdminIconName } from './icons';

const fmt = new Intl.NumberFormat('en-US');
export const n0 = (v: number) => fmt.format(v);
const dayFmt = new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'short' });
export const shortDay = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

/** نسبة التغيّر عن الفترة السابقة: سهم ولون ونص، لا لون وحده */
export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="delta" title="لا بيانات في الفترة السابقة">جديد</span>;
  const good = invert ? value < 0 : value > 0;
  const cls = value === 0 ? '' : good ? ' up' : ' down';
  return (
    <span className={`delta${cls}`} title="مقارنة بالفترة السابقة المساوية">
      {value !== 0 && <AIcon name={value > 0 ? 'up' : 'down'} size={14} />}
      <span className="num" dir="ltr">{value > 0 ? '+' : ''}{value}%</span>
    </span>
  );
}

export function Kpi({ icon, label, value, sub, tone, delta, href }: { icon: AdminIconName; label: string; value: string; sub?: string; tone?: 'gold' | 'danger' | 'info'; delta?: number | null; href?: string }) {
  const body = (
    <>
      <span className="kpi-top"><span>{label}</span><span className="kpi-ico"><AIcon name={icon} /></span></span>
      <span className="num">{value}</span>
      <span className="between">{sub ? <small>{sub}</small> : <span />}{delta !== undefined && <Delta value={delta} />}</span>
    </>
  );
  const cls = `card kpi${tone ? ` t-${tone}` : ''}`;
  return href ? <a href={href} className={cls}>{body}</a> : <div className={cls}>{body}</div>;
}

/**
 * منحنى يومي لسلسلة واحدة (محور واحد): مساحة خفيفة وخط 2px، شبكة أفقية خافتة،
 * ومؤشر عمودي مع بطاقة عند المرور أو اللمس. المحور الأفقي من اليمين لليسار (الأقدم يميناً).
 */
export function AreaChart({ points, label, color = '#0B6E4F', unit = '' }: { points: { x: string; y: number }[]; label: string; color?: string; unit?: string }) {
  const W = 720, H = 240, L = 8, R = 44, T = 12, B = 28;
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.y));
  const nice = niceMax(max);
  const n = points.length;
  // RTL: أول نقطة على اليمين
  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : W - R - (i * (W - R - L)) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(nice * f * 100) / 100);
  const every = Math.max(1, Math.ceil(n / 7));

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    const i = n === 1 ? 0 : Math.round(((W - R - px) / (W - R - L)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const h = hover !== null ? points[hover] : null;
  const gid = `g-${label.replace(/\s/g, '')}`;
  return (
    <div className="chart-box" ref={box} onMouseMove={(e) => move(e.clientX)} onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => move(e.touches[0].clientX)} onTouchMove={(e) => move(e.touches[0].clientX)} onTouchEnd={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.length} يوماً، الأعلى ${n0(max)}${unit}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text className="axis-t" x={W - R + 8} y={y(t) + 4} textAnchor="start">{n0(t)}{unit}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (i % every === 0 || i === n - 1) && (
          <text key={p.x} className="axis-t" x={x(i)} y={H - 8} textAnchor="middle">{shortDay(p.x)}</text>
        ))}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#0E1A24" strokeOpacity=".25" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.y)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <span className="chart-tip" style={{ right: `${100 - (x(hover) / W) * 100}%`, top: `${(y(h.y) / H) * 100}%` }}>
          {shortDay(h.x)} · <b className="num">{n0(h.y)}{unit}</b> {label}
        </span>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** لون الخانة: درجات أخضر واحد من الفاتح للداكن (مقدار) */
const STOPS: [number, number, number][] = [[238, 245, 241], [168, 213, 193], [62, 154, 119], [10, 74, 54]];
export function heatColor(v: number, max: number) {
  if (v <= 0 || max <= 0) return 'var(--heat-zero, #EEEAE0)';
  const t = Math.min(1, Math.sqrt(v / max)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const c = STOPS[i].map((a, k) => Math.round(a + (STOPS[i + 1][k] - a) * f));
  return `rgb(${c.join(',')})`;
}

export interface HeatData { days: { dow: number; label: string }[]; values: number[][]; max: number; peak: { dow: number; hour: number } | null; impressions: number[][]; clicks: number[][]; ctr: number[][] }

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** الخريطة الحرارية: صف لكل يوم (من السبت) و24 عموداً للساعات بتوقيت بغداد؛ كل خانة زر بوصف كامل للقارئ الآلي */
export function Heatmap({ data, unit, onPick }: { data: HeatData; unit: string; onPick?: (dow: number, hour: number) => void }) {
  const [tip, setTip] = useState<{ d: number; h: number } | null>(null);
  return (
    <div className="heat-wrap">
      <div className="heat" role="grid" aria-label="الخريطة الحرارية: الأيام × الساعات" onMouseLeave={() => setTip(null)}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="hh num" aria-hidden="true">{h % 3 === 0 ? h : ''}</span>)}
        {data.days.map((d, di) => (
          <div key={d.dow} role="row" style={{ display: 'contents' }}>
            <span className="hl" role="rowheader">{d.label}</span>
            {data.values[di].map((v, h) => {
              const desc = `${d.label} ${hourLabel(h)}: ظهور ${n0(data.impressions[di][h])}، نقرات ${n0(data.clicks[di][h])}، نسبة النقر ${data.ctr[di][h]}%`;
              const isPeak = data.peak?.dow === d.dow && data.peak.hour === h;
              return (
                <button key={h} type="button" role="gridcell" aria-label={desc} title={desc} className={isPeak ? 'peak' : undefined}
                  style={{ background: heatColor(v, data.max) }}
                  onMouseEnter={() => setTip({ d: di, h })} onFocus={() => setTip({ d: di, h })} onClick={() => onPick?.(d.dow, h)} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="between" style={{ marginTop: 10 }}>
        <span className="heat-legend">أقل <i /> أكثر</span>
        <span className="muted" aria-live="polite">
          {tip ? <>{data.days[tip.d].label} · <span className="num">{hourLabel(tip.h)}</span> — <b className="num">{n0(data.values[tip.d][tip.h])}{unit}</b></> : 'مرّر على خانة لعرض قيمتها، واضغطها لتصفية تلك الساعة.'}
        </span>
      </div>
    </div>
  );
}

/** قائمة أشرطة أفقية مرتبة (القيمة نص بجانب الشريط) */
export function BarList({ rows, unit = '' }: { rows: { key: string | number; label: string; value: number; note?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.key}>
          <span>{r.label}{r.note && <span className="muted"> · {r.note}</span>}</span>
          <b className="num">{n0(r.value)}{unit}</b>
          <span className="bar" aria-hidden="true"><i style={{ width: `${(r.value / max) * 100}%` }} /></span>
        </li>
      ))}
    </ul>
  );
}
