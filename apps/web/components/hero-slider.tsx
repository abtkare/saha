'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RESULT_STATUS_LABELS } from '@saha/shared';
import type { Hero, HeroSlide, MatchItem } from '@/lib/api';
import { deviceId } from '@/lib/client';
import { kickoffTime, scoreText } from '@/lib/format';
import { Crest, LiveCard } from './cards';

const AUTO_MS = 6000;

/** تسجيل ظهور/نقرة — الخادم يحسب مرة واحدة لكل جهاز في اليوم، والنقرة بعد ظهور فقط */
function track(id: number, type: 'impression' | 'click') {
  try {
    void fetch(`/api/v1/hero/${id}/events`, {
      method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, deviceId: deviceId() }),
    }).catch(() => undefined);
  } catch { /* القياس لا يعطّل الصفحة */ }
}

function MatchSlide({ s }: { s: HeroSlide }) {
  const m = s.match!;
  const live = m.resultStatus === 'scheduled' && m.liveText;
  const status = live ? 'مباشر' : m.resultStatus === 'scheduled' ? RESULT_STATUS_LABELS.scheduled : `نتيجة ${RESULT_STATUS_LABELS[m.resultStatus]}`;
  return (
    <>
      <div className="between"><span className="muted">{s.titleAr} · {m.tournament.nameAr}</span><span className={`badge ${live ? 'b-live' : `s-${m.resultStatus}`}`}>{status}</span></div>
      <div className="vs">
        <div className="team"><Crest team={m.homeTeam} size="lg" /><b>{m.homeTeam.nameAr}</b></div>
        <span className="num score-lg">{scoreText(m)}</span>
        <div className="team"><Crest team={m.awayTeam} size="lg" /><b>{m.awayTeam.nameAr}</b></div>
      </div>
      {live && <p className="live-text">{m.liveText}</p>}
      {m.homePens !== null && m.awayPens !== null && <p className="live-text">ركلات الترجيح <span className="num">{m.homePens} – {m.awayPens}</span></p>}
      <div className="meta">{m.venue && <span>{m.venue}</span>}<span className="num">{kickoffTime(m.kickoffAt)}</span></div>
    </>
  );
}

function ImageSlide({ s }: { s: HeroSlide }) {
  // كما في التصميم الأصلي: بلا صورة (أو فشل تحميلها) تظهر أرضية الملعب
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [s.imageUrl]);
  return (
    <>
      {s.imageUrl && !failed ? <img src={s.imageUrl} alt="" className="slide-bg" onError={() => setFailed(true)} /> : <img src="/slides/pitch.svg" alt="" className="slide-bg" />}
      {s.sponsored && <span className="badge gold slide-badge">برعاية{s.sponsor ? ` ${s.sponsor.nameAr}` : ''}</span>}
      <span className="slide-text">
        <b>{s.titleAr}</b>
        {s.subtitleAr && <span>{s.subtitleAr}</span>}
      </span>
    </>
  );
}

function slideHref(s: HeroSlide): string | null {
  if (s.linkUrl) return s.linkUrl;
  if (s.type === 'match' && s.match) return `/matches/${s.match.id}`;
  if (s.tournament) return `/tournaments/${s.tournament.slug}`;
  if (s.type === 'sponsor' && s.sponsor?.website) return s.sponsor.website;
  return null;
}

/**
 * الهيرو سلايدر — يحل محل بطاقة «مباراة اليوم» في الهيرو بنفس مكانها وحجمها.
 * شريحة المباراة بتصميم .card.live نفسه، والشرائح الأخرى 16:9 بتدرّج داكن وشارة «برعاية» ذهبية.
 * يتحدث كل refreshSeconds، ويقيس الظهور والنقر. إن لم توجد شرائح تبقى بطاقة «مباراة اليوم» كما في التصميم.
 */
export function HeroSlider({ initialHero, fallback }: { initialHero: Hero | null; fallback: { match: MatchItem; label: string } | null }) {
  const [slides, setSlides] = useState<HeroSlide[]>(initialHero?.slides ?? []);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const seen = useRef(new Set<number>());
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const cur = n ? Math.min(i, n - 1) : 0;

  const go = useCallback((d: number) => setI((x) => (n ? (Math.min(x, n - 1) + d + n) % n : 0)), [n]);

  // تحديث الشرائح دورياً (النتيجة النصية لمباراة اليوم)
  useEffect(() => {
    const every = Math.max(10, initialHero?.refreshSeconds ?? 30) * 1000;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/v1/home/hero', { cache: 'no-store' });
        if (res.ok) setSlides(((await res.json()) as Hero).slides);
      } catch { /* نحاول في الدورة التالية */ }
    }, every);
    return () => clearInterval(t);
  }, [initialHero?.refreshSeconds]);

  // التقليب التلقائي (يتوقف عند اللمس أو المرور بالفأرة أو تقليل الحركة)
  useEffect(() => {
    if (n < 2 || paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => { if (!document.hidden) go(1); }, AUTO_MS);
    return () => clearInterval(t);
  }, [n, paused, go]);

  // ظهور الشريحة الحالية — مرة في الصفحة، والخادم يمنع التكرار في اليوم
  useEffect(() => {
    const s = slides[cur];
    if (!s || document.hidden || seen.current.has(s.id)) return;
    seen.current.add(s.id);
    track(s.id, 'impression');
  }, [cur, slides]);

  if (!n) return fallback ? <LiveCard m={fallback.match} label={fallback.label} /> : null;

  return (
    <div
      className="slider" aria-roledescription="carousel" aria-label="شرائح ساحة"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const start = touch.current; touch.current = null;
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(dx > 0 ? 1 : -1); // الاتجاه من اليمين لليسار
      }}
    >
      <div className="slides">
        {slides.map((s, k) => {
          const href = slideHref(s);
          const external = !!href && /^https:/.test(href);
          const cls = `card ${s.type === 'match' && s.match ? 'live' : 'slide-img'}${k === cur ? ' on' : ''}`;
          const body = s.type === 'match' && s.match ? <MatchSlide s={s} /> : <ImageSlide s={s} />;
          const label = `${k + 1} من ${n}`;
          return href ? (
            <a key={s.id} href={href} className={cls} aria-hidden={k !== cur} tabIndex={k === cur ? 0 : -1} aria-label={`${s.titleAr} — ${label}`}
              {...(external ? { target: '_blank', rel: 'noopener sponsored' } : {})} onClick={() => track(s.id, 'click')}>{body}</a>
          ) : (
            <article key={s.id} className={cls} aria-hidden={k !== cur} aria-label={label}>{body}</article>
          );
        })}
      </div>
      {n > 1 && (
        <div className="dots" role="tablist" aria-label="اختر الشريحة">
          {slides.map((s, k) => (
            <button key={s.id} type="button" role="tab" aria-selected={k === cur} aria-label={`الشريحة ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
      )}
    </div>
  );
}
