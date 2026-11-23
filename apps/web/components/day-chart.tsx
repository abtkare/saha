/** رسم أعمدة يومي بسيط (SVG) — اتجاه الزمن من اليمين لليسار كما يقرأ العربي، والقيم بالأرقام 0–9 */
export function DayChart({ days, values, label, tone = 'primary' }: { days: string[]; values: number[]; label: string; tone?: 'primary' | 'gold' }) {
  const W = 640, H = 160, PAD_T = 18, PAD_B = 22;
  const max = Math.max(1, ...values);
  const n = Math.max(1, days.length);
  const step = W / n;
  const bw = Math.max(2, Math.min(28, step * 0.62));
  const total = values.reduce((a, b) => a + b, 0);
  const peakI = values.indexOf(Math.max(...values));
  const tick = n <= 10 ? 1 : Math.ceil(n / 6);
  return (
    <figure className="chart">
      <figcaption><b>{label}</b><span className="muted">المجموع <span className="num">{total}</span></span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: المجموع ${total}`} preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} className="axis" />
        {values.map((v, i) => {
          const h = ((H - PAD_T - PAD_B) * v) / max;
          const x = W - (i + 0.5) * step - bw / 2; // اليوم الأول على اليمين
          return (
            <g key={days[i]}>
              <rect x={x} y={H - PAD_B - h} width={bw} height={Math.max(v ? 1 : 0, h)} rx="2" className={`bar ${tone}`}><title>{`${days[i]}: ${v}`}</title></rect>
              {i === peakI && v > 0 && <text x={x + bw / 2} y={H - PAD_B - h - 5} textAnchor="middle" className="val">{v}</text>}
              {i % tick === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="tick">{days[i].slice(5).replace('-', '/')}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
