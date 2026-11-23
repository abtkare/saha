import type { Metadata, Viewport } from 'next';
import { brand } from '@saha/ui';
import { BrandSymbols, Mark } from '@/components/mark';
import { Splash } from '@/components/splash';
import './saha.css';

export const metadata: Metadata = {
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: 'منصة بطولات كرة القدم للفرق الشعبية ومتابعي المؤثرين وأعضاء مجموعات فيسبوك.',
  icons: { icon: '/saha-app-icon.svg' },
  robots: process.env.NOINDEX === 'false' ? undefined : { index: false, follow: false },
};

// التصميم المتفق عليه فاتح فقط؛ الوضع الداكن يُصمَّم لاحقاً (الجلسة 6)
export const viewport: Viewport = { themeColor: '#0B6E4F', colorScheme: 'light', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <BrandSymbols />
        <Splash />

        <header className="top">
          <div className="wrap top-in">
            <a href="/" className="brand" aria-label={`${brand.name} — الرئيسية`}>
              <Mark size={44} />
              <span>{brand.name}</span>
            </a>
            <nav className="nav" aria-label="القائمة">
              <a href="/#matches">المباريات</a>
              <a href="/#tournaments">البطولات</a>
              <a href="/#news">الأخبار</a>
              <a href="/#sponsor">كن راعياً</a>
            </nav>
            <a href="/#app" className="btn btn-primary">حمّل التطبيق</a>
          </div>
        </header>

        <main>{children}</main>

        <footer className="foot">
          <div className="wrap foot-in">
            <span className="brand light"><Mark size={32} /><span>{brand.name}</span></span>
            <nav aria-label="روابط التذييل"><a href="#">الشروط</a><a href="#">الخصوصية</a><a href="#">تواصل معنا</a></nav>
            <span>جمعية الميثاق الأعظم · نسخة تجريبية</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
