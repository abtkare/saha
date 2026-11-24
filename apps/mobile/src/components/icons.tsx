/** الرموز: شعار «ساحة» منقول حرفياً من التصميم، وأيقونات بأسلوب Lucide (خط 2px) كما في لوحة التصاميم */
import Svg, { Circle, Path } from 'react-native-svg';

export const MARK_PATH = 'M98 52 L98 62 Q98 70 90 70 Q82 70 82 62 L82 52 L82 62 Q82 70 74 70 Q66 70 66 62 L66 52 L66 66 A22 22 0 0 1 22 66 L22 58';

/** رمز «ساحة»: حرف «س» كقوس منطقة الجزاء والكرة الذهبية */
export function Mark({ size = 40, color = '#0B6E4F', ball = '#F2B705' }: { size?: number; color?: string; ball?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d={MARK_PATH} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={82} cy={34} r={8.5} fill={ball} />
    </Svg>
  );
}

type Shape = { d?: string; c?: [number, number, number] };
const ICONS: Record<string, Shape[]> = {
  home: [{ d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }],
  trophy: [{ d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4' }],
  team: [{ c: [9, 8, 4] }, { d: 'M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7' }],
  news: [{ d: 'M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5' }],
  user: [{ c: [12, 8, 4] }, { d: 'M4 21a8 8 0 0 1 16 0' }],
  bell: [{ d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0' }],
  search: [{ c: [11, 11, 7] }, { d: 'm20 20-3.5-3.5' }],
  clock: [{ c: [12, 12, 9] }, { d: 'M12 7v5l3 2' }],
  pin: [{ d: 'M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z' }, { c: [12, 9, 2.5] }],
  /** سهم الرجوع في واجهة عربية يشير لليمين */
  back: [{ d: 'm9 18 6-6-6-6' }],
  /** سهم «التالي» في واجهة عربية يشير لليسار */
  next: [{ d: 'm15 18-6-6 6-6' }],
  moon: [{ d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  sun: [{ c: [12, 12, 4] }, { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' }],
  camera: [{ d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z' }, { c: [12, 13, 3] }],
  image: [{ d: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM21 15l-5-5L5 21' }, { c: [9, 9, 2] }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  minus: [{ d: 'M5 12h14' }],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  x: [{ d: 'M18 6 6 18M6 6l12 12' }],
  shield: [{ d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }, { d: 'm9 12 2 2 4-4' }],
  flag: [{ d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.33 2q2 0 3.67-1.33a1 1 0 0 1 1.6.8v9.53a1 1 0 0 1-.4.8A6 6 0 0 1 16.33 14C14 14 12 12 9 12a7 7 0 0 0-5 2' }],
  whistle: [{ d: 'M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7H2zM6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2zM18 11c-1.5 0-3 .5-3 2 2 0 3 0 3-2z' }],
  share: [{ c: [18, 5, 3] }, { c: [6, 12, 3] }, { c: [18, 19, 3] }, { d: 'm8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98' }],
  logout: [{ d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' }],
  trash: [{ d: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
  link: [{ d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  child: [{ c: [12, 6, 3] }, { d: 'M8 22v-7H6l2-6h8l2 6h-2v7M10 22v-4h4v4' }],
  refresh: [{ d: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5' }],
  info: [{ c: [12, 12, 10] }, { d: 'M12 16v-4M12 8h.01' }],
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, color = '#0E1A24', width = 2 }: { name: IconName; size?: number; color?: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((s, i) => (s.c ? <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} /> : <Path key={i} d={s.d!} />))}
    </Svg>
  );
}

/** خطوط الملعب الخفيفة خلف الهيرو الأخضر (.pitch .pl) */
export function PitchLines({ width, height }: { width: number; height: number }) {
  const cx = width / 2, cy = height / 2, box = Math.min(38, width * 0.1);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      <Circle cx={cx} cy={cy} r={Math.min(46, height * 0.23)} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.16} />
      <Path d={`M${cx} 0 V${height} M0 ${height * 0.26} H${box} V${height * 0.74} H0 M${width} ${height * 0.26} H${width - box} V${height * 0.74} H${width}`} fill="none" stroke="#FFFFFF" strokeWidth={1.5} opacity={0.16} />
    </Svg>
  );
}
