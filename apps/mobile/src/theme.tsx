/**
 * الهوية في التطبيق: نفس ألوان tokens.css (من @saha/ui) ونفس قيم saha.css في الوضعين.
 * React Native لا يقرأ CSS، فكل قيمة هنا منقولة من الموقع بالاسم نفسه.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager, Text, useColorScheme, type TextProps, type TextStyle } from 'react-native';
import { colors } from '@saha/ui';
import type { ResultStatus } from '@saha/shared';
import { store } from './storage';

export type Mode = 'system' | 'light' | 'dark';

export interface Palette {
  dark: boolean;
  primary: string; accent: string; ink: string; bg: string; surface: string; muted: string; border: string; danger: string; info: string;
  /** شريط الرأس والتبويبات (.top) */
  bar: string;
  /** الهيرو الأخضر (.hero) */
  hero: string;
  /** خلفية الشعار المؤقت (.crest) والشارة (.kind) */
  tint: string;
  /** فاصل داخلي (#EFEBE2 في .meta و .table td) */
  line: string;
  /** رأس الجدول (.table th) */
  head: string;
  /** صورة الخبر المؤقتة (.news .thumb) */
  thumb: string;
  /** نص الزر الأساسي */
  onPrimary: string;
  status: Record<ResultStatus, { bg: string; fg: string }>;
}

const light: Palette = {
  dark: false, ...colors.light, muted: '#5B6770',
  bar: '#FFFFFF', hero: '#0B6E4F', tint: '#E6F1EC', line: '#EFEBE2', head: '#FAF8F3', thumb: '#DCEBE4', onPrimary: '#FFFFFF',
  status: {
    provisional: { bg: 'rgba(45,127,249,0.12)', fg: '#1F5FC4' },
    confirmed: { bg: 'rgba(11,110,79,0.12)', fg: '#0B6E4F' },
    disputed: { bg: 'rgba(215,38,61,0.12)', fg: '#B51F33' },
    final: { bg: 'rgba(14,26,36,0.08)', fg: '#0E1A24' },
    scheduled: { bg: '#EFEBE2', fg: '#4E5A63' },
  },
};

const dark: Palette = {
  dark: true, ...colors.dark,
  bar: '#12202A', hero: '#0A5A41', tint: 'rgba(47,163,122,0.16)', line: '#24343F', head: '#12202A', thumb: '#1B3A33', onPrimary: '#0E1A24',
  status: {
    provisional: { bg: 'rgba(92,157,255,0.16)', fg: '#8DBBFF' },
    confirmed: { bg: 'rgba(47,163,122,0.18)', fg: '#5FD3A6' },
    disputed: { bg: 'rgba(255,90,110,0.16)', fg: '#FF8A99' },
    final: { bg: 'rgba(246,243,236,0.1)', fg: '#F6F3EC' },
    scheduled: { bg: '#24343F', fg: '#C9D3D9' },
  },
};

/** ثوابت مشتركة لا تتغير بالوضع */
export const brand = { green: '#0B6E4F', gold: '#F2B705', night: '#0E1A24', sand: '#F6F3EC', white: '#FFFFFF' };
export const radius = { sm: 8, md: 16, lg: 12, pill: 999 };

// ───── الاتجاه: التطبيق عربي دائماً، سواء كانت لغة الجهاز عربية (RTL) أم لا ─────
const RTL = I18nManager.isRTL;
/** صف من اليمين لليسار */
export const row = (RTL ? 'row' : 'row-reverse') as 'row' | 'row-reverse';
/** محاذاة النص لليمين */
export const right = (RTL ? 'left' : 'right') as 'left' | 'right';
/** محاذاة العنصر لبداية السطر (اليمين) في عمود */
export const start = (RTL ? 'flex-start' : 'flex-end') as 'flex-start' | 'flex-end';
export const end = (RTL ? 'flex-end' : 'flex-start') as 'flex-start' | 'flex-end';
/** القوائم الأفقية تبدأ من اليمين */
export const invertHorizontal = !RTL;
export const isRTL = RTL;

// ───── الخطوط: Cairo للعناوين والأرقام، IBM Plex Sans Arabic للنص ─────
export const font = {
  display: 'Cairo_800ExtraBold',
  title: 'Cairo_700Bold',
  body: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semi: 'IBMPlexSansArabic_600SemiBold',
};
let fontsReady = false;
export const setFontsReady = (v: boolean) => { fontsReady = v; };
/** اسم الخط إن حُمّلت الخطوط، وإلا خط النظام بالوزن المقابل */
export function ff(name: keyof typeof font): TextStyle {
  if (fontsReady) return { fontFamily: font[name] };
  const weight: Record<keyof typeof font, TextStyle['fontWeight']> = { display: '800', title: '700', body: '400', medium: '500', semi: '600' };
  return { fontWeight: weight[name] };
}

interface ThemeValue { c: Palette; mode: Mode; setMode: (m: Mode) => void }
const ThemeCtx = createContext<ThemeValue>({ c: light, mode: 'system', setMode: () => undefined });

export function ThemeProvider({ children, forced }: { children: ReactNode; forced?: 'light' | 'dark' | null }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');
  useEffect(() => { void store.get('theme').then((m) => { if (m === 'light' || m === 'dark' || m === 'system') setModeState(m); }); }, []);
  const setMode = (m: Mode) => { setModeState(m); void store.set('theme', m); };
  const effective = forced ?? (mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode);
  const value = useMemo(() => ({ c: effective === 'dark' ? dark : light, mode, setMode }), [effective, mode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'bodyB' | 'small' | 'smallB' | 'tiny' | 'num';
const VARIANTS: Record<Variant, { f: keyof typeof font; size: number; lh: number }> = {
  h1: { f: 'display', size: 28, lh: 1.25 },
  h2: { f: 'title', size: 20, lh: 1.3 },
  h3: { f: 'title', size: 16, lh: 1.4 },
  body: { f: 'body', size: 15, lh: 1.6 },
  bodyB: { f: 'semi', size: 15, lh: 1.5 },
  small: { f: 'body', size: 13, lh: 1.5 },
  smallB: { f: 'semi', size: 13, lh: 1.5 },
  tiny: { f: 'semi', size: 12, lh: 1.4 },
  num: { f: 'display', size: 16, lh: 1.2 },
};

/** نص عربي بالهوية: الخط والحجم واللون والمحاذاة لليمين */
export function T({ v = 'body', color, center, muted, size, style, ...rest }: TextProps & { v?: Variant; color?: string; center?: boolean; muted?: boolean; size?: number }) {
  const { c } = useTheme();
  const d = VARIANTS[v];
  const s = size ?? d.size;
  return (
    <Text
      {...rest}
      style={[
        ff(d.f),
        { fontSize: s, lineHeight: Math.round(s * d.lh), color: color ?? (muted ? c.muted : c.ink), textAlign: center ? 'center' : right, writingDirection: 'rtl' },
        v === 'num' && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
