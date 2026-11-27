/** أيقونات اللوحة — خطوط 24×24 بنفس سماكة أيقونات التصميم */
const P: Record<string, string> = {
  dashboard: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
  whistle: 'M3 12a5 5 0 1 0 10 0V9h8V6H8a5 5 0 0 0-5 6zM8 12h.01',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4',
  slides: 'M3 5h18v12H3zM8 21h8M12 17v4',
  news: 'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5',
  handshake: 'M2 11l4-4 4 2 3-2 3 1 4-2 2 2-6 7-3-2-3 3-4-3zM9 13l2 2M12 11l2 2',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  coins: 'M9 8a6 3 0 1 0 12 0A6 3 0 1 0 9 8M9 8v4c0 1.7 2.7 3 6 3s6-1.3 6-3V8M3 13c0 1.7 2.7 3 6 3M3 13V9c0-1.7 2.7-3 6-3M3 13v4c0 1.7 2.7 3 6 3s6-1.3 6-3',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-5-6.7',
  audit: 'M9 4h6l1 2h3v15H5V6h3zM9 12l2 2 4-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6 6 18',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  up: 'M7 14l5-5 5 5',
  down: 'M7 10l5 5 5-5',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7l4 3-1.5 5h-5L8 10zM12 3v4M21 10l-5 0M3 10h5M7 20l2-5M17 20l-2-5',
  card: 'M7 3h10v18H7z',
  check: 'M5 12l5 5 9-10',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  click: 'M9 3v3M3 9h3M5 5l2 2M12 12l9 3-4 2-2 4z',
  device: 'M7 2h10v20H7zM11 18h2',
  percent: 'M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
};

export type AdminIconName = keyof typeof P;

export function AIcon({ name, size = 20 }: { name: AdminIconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="ad-ico">
      <path d={P[name]} />
    </svg>
  );
}
