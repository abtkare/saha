/** الرأس وشريط التبويبات والهيرو الأخضر — من تصميم «رئيسية التطبيق» في لوحة التصاميم */
import type { ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { useNav, type TabName } from '../nav';
import { ff, radius, row, start, T, useTheme } from '../theme';
import { Icon, Mark, PitchLines, type IconName } from './icons';
import { IconButton } from './ui';

/** رأس الرئيسية: الشعار و«ساحة» يميناً، والبحث والإشعارات يساراً */
export function BrandHeader() {
  const { c } = useTheme();
  const { push } = useNav();
  const { unread, me } = useAuth();
  const inset = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', paddingTop: inset.top + 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.bg }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: 6 }} accessibilityRole="header" accessibilityLabel="ساحة">
        <Mark size={40} color={c.primary} />
        <T v="h1" size={26} style={{ lineHeight: 34 }}>ساحة</T>
      </View>
      <View style={{ flexDirection: row, gap: 8 }}>
        <IconButton name="search" label="بحث" onPress={() => push({ name: 'search' })} />
        <IconButton name="bell" label={unread ? `الإشعارات، ${unread} غير مقروءة` : 'الإشعارات'} dot={unread > 0} onPress={() => push(me ? { name: 'notifications' } : { name: 'login' })} />
      </View>
    </View>
  );
}

/** رأس تبويب: عنوان كبير وأزرار اختيارية */
export function TabHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  const { c } = useTheme();
  const inset = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: inset.top + 14, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.bg, flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h1" accessibilityRole="header">{title}</T>
        {subtitle ? <T v="small" muted>{subtitle}</T> : null}
      </View>
      {children ? <View style={{ flexDirection: row, gap: 8 }}>{children}</View> : null}
    </View>
  );
}

/** رأس شاشة فرعية: زر الرجوع يميناً والعنوان. hero = فوق الهيرو الأخضر */
export function TopBar({ title, hero, right }: { title?: string; hero?: boolean; right?: ReactNode }) {
  const { c } = useTheme();
  const { pop } = useNav();
  const inset = useSafeAreaInsets();
  const fg = hero ? '#FFFFFF' : c.ink;
  return (
    <View style={{ paddingTop: inset.top + 6, paddingHorizontal: 8, paddingBottom: 6, backgroundColor: hero ? c.hero : c.bar, borderBottomWidth: hero ? 0 : 1, borderBottomColor: c.border, flexDirection: row, alignItems: 'center', gap: 4, minHeight: inset.top + 56 }}>
      <Pressable onPress={pop} accessibilityRole="button" accessibilityLabel="رجوع" hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="back" size={26} color={fg} />
      </Pressable>
      <T v="h3" size={17} color={fg} numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">{title ?? ''}</T>
      <View style={{ minWidth: 44, alignItems: 'center' }}>{right}</View>
    </View>
  );
}

/** الهيرو الأخضر بخطوط الملعب (.hero.page) */
export function HeroBlock({ children, pad = 20 }: { children: ReactNode; pad?: number }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={{ backgroundColor: c.hero, overflow: 'hidden' }}>
      <PitchLines width={width} height={260} />
      <View style={{ padding: pad, paddingTop: 8, gap: 12 }}>{children}</View>
    </View>
  );
}

const TAB_ITEMS: { key: TabName; label: string; icon: IconName }[] = [
  { key: 'home', label: 'الرئيسية', icon: 'home' },
  { key: 'tournaments', label: 'البطولات', icon: 'trophy' },
  { key: 'myteams', label: 'فريقي', icon: 'team' },
  { key: 'news', label: 'الأخبار', icon: 'news' },
  { key: 'account', label: 'حسابي', icon: 'user' },
];

/** شريط التبويبات السفلي (nav في تصميم التطبيق) */
export function TabBar() {
  const { c } = useTheme();
  const { tab, goTab } = useNav();
  const inset = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: row, backgroundColor: c.bar, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, paddingHorizontal: 8, paddingBottom: Math.max(inset.bottom, 10) }}>
      {TAB_ITEMS.map((it) => {
        const on = it.key === tab;
        const color = on ? c.primary : c.muted;
        return (
          <Pressable key={it.key} onPress={() => goTab(it.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
            style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Icon name={it.icon} size={24} color={color} />
            <T v="tiny" color={color} center style={on ? ff('semi') : ff('medium')}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** حاوية بطاقة على الهيرو (.card.live) */
export function LivePanel({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: 18, gap: 14, shadowColor: '#0E1A24', shadowOpacity: c.dark ? 0.4 : 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6, alignItems: 'stretch' }}>
      {children}
    </View>
  );
}

export const alignStart = { alignSelf: start } as const;
