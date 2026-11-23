/** رمز «ساحة» — منقول حرفياً من apps/preview/public/index.html */
export const MARK_PATH = 'M98 52 L98 62 Q98 70 90 70 Q82 70 82 62 L82 52 L82 62 Q82 70 74 70 Q66 70 66 62 L66 52 L66 66 A22 22 0 0 1 22 66 L22 58';

export function BrandSymbols() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <symbol id="mark" viewBox="0 0 120 120">
          <path className="mk-s" d={MARK_PATH} />
          <circle className="mk-b" cx="82" cy="34" r="8.5" />
        </symbol>
        <clipPath id="ballClip"><circle cx="0" cy="0" r="10" /></clipPath>
      </defs>
    </svg>
  );
}

export function Mark({ size, style }: { size: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} style={style} aria-hidden="true"><use href="#mark" /></svg>;
}

export function Trophy() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </svg>
  );
}

export function PitchLines({ variant }: { variant: 'hero' | 'splash' }) {
  if (variant === 'splash') {
    return (
      <svg className="pitch" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <circle className="pl" cx="195" cy="422" r="118" />
        <path className="pl pl2" d="M-400 422 H790" />
      </svg>
    );
  }
  return (
    <svg className="pitch" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle className="pl" cx="720" cy="280" r="150" />
      <path className="pl" d="M720 0 V560 M0 150 H180 V410 H0 M1440 150 H1260 V410 H1440" />
    </svg>
  );
}
