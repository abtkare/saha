import type { Banner } from '@/lib/api';

/**
 * الراعي الدائم (الجلسة 14): لوحة إعلان ثابتة بعرض الصفحة، لا تدور مع الهيرو سلايدر.
 * الصورة كما رُفعت من اللوحة (يُفضَّل 1600×900)، والنقر يفتح موقع الراعي.
 */
export function SponsorBanners({ banners }: { banners: Banner[] | null | undefined }) {
  if (!banners?.length) return null;
  return (
    <section className="wrap sec sponsor-banners" aria-label="الرعاة">
      {banners.map((b) => {
        const img = <img src={b.imageUrl} alt={b.labelAr} loading="lazy" decoding="async" />;
        const external = !!b.linkUrl && /^https:/.test(b.linkUrl);
        return b.linkUrl ? (
          <a key={b.id} href={b.linkUrl} className="sponsor-banner" {...(external ? { target: '_blank', rel: 'noopener sponsored' } : {})}>{img}</a>
        ) : <div key={b.id} className="sponsor-banner">{img}</div>;
      })}
    </section>
  );
}
