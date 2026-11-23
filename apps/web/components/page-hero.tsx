import { PitchLines } from './mark';

/** رأس الصفحات الداخلية — نفس .hero الأخضر من المعاينة بارتفاع أقل (.hero.page) */
export function PageHero({ title, text, chips, crumbs, children }: {
  title: string; text?: string | null; chips?: (string | null | false | undefined)[]; crumbs?: { href: string; label: string }[]; children?: React.ReactNode;
}) {
  const shown = (chips ?? []).filter(Boolean) as string[];
  return (
    <section className="hero page">
      <PitchLines variant="hero" />
      <div className="wrap hero-in">
        <div className="hero-text">
          {crumbs && crumbs.length > 0 && (
            <nav className="crumbs" aria-label="مسار الصفحة">
              {crumbs.map((c) => <a key={c.href} href={c.href}>{c.label}</a>)}
            </nav>
          )}
          <h1>{title}</h1>
          {text && <p>{text}</p>}
          {shown.length > 0 && <div className="chips">{shown.map((c) => <span key={c}>{c}</span>)}</div>}
          {children}
        </div>
      </div>
    </section>
  );
}

/** نص عادي (بلا HTML) مقسّم إلى فقرات — كما يحفظه الخادم */
export function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n{2,}|\r\n\r\n/).map((p, i) => <p key={i}>{p.split('\n').map((l, j) => (j ? [<br key={j} />, l] : l))}</p>)}</>;
}
