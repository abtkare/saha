import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { brand } from '@saha/ui';
import '@saha/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: 'منصة بطولات كرة القدم للفرق الشعبية ومتابعي المؤثرين وأعضاء مجموعات فيسبوك.',
  icons: { icon: '/saha-app-icon.svg' },
  robots: process.env.NOINDEX === 'false' ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0B6E4F' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1A24' },
  ],
};

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
      <body>
        <header className="topbar">
          <Link href="/" className="logo" aria-label={brand.name}>
            <img src="/saha-mark-white.svg" alt="" width={36} height={36} />
            <span>{brand.name}</span>
          </Link>
          <nav>
            <Link href="/#tournaments">البطولات</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <span>{brand.name} — {brand.tagline}</span>
          <span className="muted">نسخة تطوير · بيانات تجريبية</span>
        </footer>
      </body>
    </html>
  );
}
