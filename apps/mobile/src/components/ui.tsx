/** مكونات أساسية بنفس قيم saha.css: البطاقة، الشارة، الأزرار، الحقول، التبويبات، الأقسام */
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { RESULT_STATUS_LABELS, type ResultStatus } from '@saha/shared';
import { ff, isRTL, radius, right, row, start, T, useTheme } from '../theme';
import { Icon, type IconName } from './icons';
import { WEB_URL } from '../config';

/** روابط الصور من الخادم (/api/v1/media/5) تُكمَّل بعنوانه */
export const mediaUri = (u: string) => (/^https?:/.test(u) ? u : `${WEB_URL}${u.startsWith('/') ? '' : '/'}${u}`);

export function Card({ children, style, onPress, flush }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; flush?: boolean }) {
  const { c } = useTheme();
  const base: ViewStyle = { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: flush ? 'hidden' : undefined };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [base, pressed && { borderColor: c.dark ? '#3A4C58' : '#C9C2B2', opacity: 0.96 }, style]}>
      {children}
    </Pressable>
  );
}

/** شارة الحالة (.badge .s-*) */
export function StatusBadge({ status, label, small }: { status: ResultStatus; label?: string; small?: boolean }) {
  const { c } = useTheme();
  const s = c.status[status];
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: radius.pill, paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 3 : 4, alignSelf: 'center' }}>
      <T v="tiny" size={small ? 11 : 12} color={s.fg} center>{label ?? RESULT_STATUS_LABELS[status]}</T>
    </View>
  );
}

/** شارة نصية: kind (أخضر فاتح)، gold، أو بلون مخصص */
export function Chip({ children, tone = 'kind', style }: { children: ReactNode; tone?: 'kind' | 'gold' | 'glass' | 'danger' | 'info'; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const tones = {
    kind: { bg: c.tint, fg: c.primary },
    gold: { bg: '#F2B705', fg: '#0E1A24' },
    glass: { bg: 'rgba(255,255,255,0.16)', fg: '#FFFFFF' },
    danger: { bg: c.status.disputed.bg, fg: c.status.disputed.fg },
    info: { bg: c.status.provisional.bg, fg: c.status.provisional.fg },
  }[tone];
  return (
    <View style={[{ backgroundColor: tones.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: start }, style]}>
      <T v="tiny" color={tones.fg}>{children}</T>
    </View>
  );
}

type BtnKind = 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost' | 'light';
export function Button({ title, onPress, kind = 'primary', icon, busy, disabled, small, style }: {
  title: string; onPress?: () => void | Promise<void>; kind?: BtnKind; icon?: IconName; busy?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const [running, setRunning] = useState(false);
  const k = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    secondary: { bg: 'transparent', fg: c.primary, border: c.primary },
    gold: { bg: '#F2B705', fg: '#0E1A24', border: '#F2B705' },
    danger: { bg: c.danger, fg: '#FFFFFF', border: c.danger },
    ghost: { bg: 'transparent', fg: '#FFFFFF', border: '#FFFFFF' },
    light: { bg: c.bg, fg: c.ink, border: c.bg },
  }[kind];
  const loading = busy || running;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: off, busy: loading }} disabled={off}
      onPress={async () => {
        if (!onPress) return;
        const r = onPress();
        if (r instanceof Promise) { setRunning(true); try { await r; } finally { setRunning(false); } }
      }}
      style={({ pressed }) => [{
        minHeight: small ? 40 : 48, paddingHorizontal: small ? 14 : 20, borderRadius: radius.sm, borderWidth: 2, borderColor: k.border, backgroundColor: k.bg,
        flexDirection: row, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off && !loading ? 0.5 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={k.fg} /> : (
        <>
          {icon && <Icon name={icon} size={18} color={k.fg} />}
          <T v="bodyB" color={k.fg} size={small ? 14 : 16} center>{title}</T>
        </>
      )}
    </Pressable>
  );
}

/** زر دائري 44×44 بحد (أيقونات الرأس في تصميم التطبيق) */
export function IconButton({ name, onPress, label, dot, onHero }: { name: IconName; onPress: () => void; label: string; dot?: boolean; onHero?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        borderColor: onHero ? 'rgba(255,255,255,0.35)' : c.border, backgroundColor: onHero ? 'rgba(255,255,255,0.08)' : c.surface, opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={name} size={20} color={onHero ? '#FFFFFF' : c.ink} />
      {dot && <View style={{ position: 'absolute', top: 10, left: 11, width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger, borderWidth: 2, borderColor: onHero ? c.hero : c.surface }} />}
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...rest }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="smallB">{label}</T>
      <TextInput
        placeholderTextColor={c.muted}
        {...rest}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[ff('body'), {
          minHeight: 48, borderWidth: focus ? 2 : 1, borderColor: error ? c.danger : focus ? c.primary : c.border, borderRadius: radius.sm,
          paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: c.ink, backgroundColor: c.surface, textAlign: right, writingDirection: 'rtl',
        }, rest.multiline && { minHeight: 96, textAlignVertical: 'top' }, style]}
      />
      {error ? <T v="small" color={c.danger}>{error}</T> : hint ? <T v="small" muted>{hint}</T> : null}
    </View>
  );
}

/** تبويبات على شكل حبة (.tabs) */
export function Tabs<K extends string>({ items, value, onChange, scroll }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; scroll?: boolean }) {
  const { c } = useTheme();
  // القائمة الأفقية تبدأ من اليمين (أول تبويب) في الواجهة العربية
  const scrollRef = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const body = items.map((it) => {
    const on = it.key === value;
    return (
      <Pressable
        key={it.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)}
        style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center', flexGrow: scroll ? 0 : 1 }}
      >
        <T v="smallB" size={14} color={on ? c.onPrimary : c.ink} center>{it.label}</T>
      </Pressable>
    );
  });
  const box: ViewStyle = { flexDirection: row, gap: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, padding: 4 };
  if (!scroll) return <View style={box} accessibilityRole="tablist">{body}</View>;
  return (
    <ScrollView ref={scrollRef as never} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
      onContentSizeChange={() => { if (!isRTL) scrollRef.current?.scrollToEnd({ animated: false }); }}>
      <View style={box} accessibilityRole="tablist">{body}</View>
    </ScrollView>
  );
}

/** عنوان قسم مع رابط «عرض الكل» (h2 + a في تصميم التطبيق) */
export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
      <T v="h2" accessibilityRole="header">{title}</T>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link"><T v="smallB" size={14} color={c.primary}>{action}</T></Pressable>
      )}
    </View>
  );
}

export function Section({ title, action, onAction, children, padded = true, style }: { title?: string; action?: string; onAction?: () => void; children: ReactNode; padded?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingTop: 24, gap: 12 }, padded && { paddingHorizontal: 16 }, style]}>
      {title && <View style={!padded && { paddingHorizontal: 16 }}><SectionHead title={title} action={action} onAction={onAction} /></View>}
      {children}
    </View>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Card style={{ paddingVertical: 28, paddingHorizontal: 18, alignItems: 'center', gap: 10 }}>
      {icon && <Icon name={icon} size={28} color={c.muted} />}
      <T muted center>{children}</T>
    </Card>
  );
}

export function Loading() {
  const { c } = useTheme();
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} size="large" /></View>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <Card style={{ padding: 18, gap: 12, borderColor: c.status.disputed.bg }}>
      <T color={c.danger} center>{message}</T>
      {onRetry && <Button title="حاول مرة أخرى" kind="secondary" small icon="refresh" onPress={onRetry} />}
    </Card>
  );
}

/** رسالة تنبيه داخل الصفحة (نجاح/معلومة/خطأ) */
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'error' | 'warn'; children: ReactNode }) {
  const { c } = useTheme();
  const t = {
    info: c.status.provisional, ok: c.status.confirmed, error: c.status.disputed,
    warn: { bg: c.dark ? 'rgba(242,183,5,0.14)' : '#FFF6D6', fg: c.dark ? '#F2B705' : '#7A5B00' },
  }[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 12 }}>
      <T v="small" color={t.fg}>{children}</T>
    </View>
  );
}

/** شعار الفريق: صورته إن رفعها منشئ الفريق، وإلا الحرف الأول في دائرة (.crest) */
export function Crest({ name, size = 36, onHero, uri }: { name: string; size?: number; onHero?: boolean; uri?: string | null }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return (
      <View style={[box, { backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: onHero ? 'rgba(255,255,255,0.6)' : c.line }]}>
        <Image source={{ uri: mediaUri(uri) }} style={box} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={`شعار ${name}`} />
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: onHero ? '#FFFFFF' : c.tint, alignItems: 'center', justifyContent: 'center' }]}>
      <T v="num" size={Math.round(size * 0.42)} color={onHero ? '#0B6E4F' : c.primary} center>{name.trim().charAt(0)}</T>
    </View>
  );
}

/** الصورة الشخصية لصاحب الفريق/المؤثر/صاحب الصفحة بحد ذهبي، وإلا أيقونة شخص */
export function Avatar({ uri, size = 28, name }: { uri?: string | null; size?: number; name?: string | null }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[box, { borderWidth: 2, borderColor: '#F2B705', backgroundColor: c.tint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}
      accessibilityLabel={name ? `صورة ${name}` : undefined}>
      {uri && !failed
        ? <Image source={{ uri: mediaUri(uri) }} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} onError={() => setFailed(true)} />
        : <Icon name="user" size={Math.round(size * 0.55)} color={c.primary} />}
    </View>
  );
}

export function Progress({ pct }: { pct: number }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden', flexDirection: row }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: c.primary, borderRadius: 3 }} />
    </View>
  );
}

/** صف إعدادات/قائمة: نص وسهم */
export function ListRow({ title, subtitle, icon, onPress, right: trailing, danger }: { title: string; subtitle?: string; icon?: IconName; onPress?: () => void; right?: ReactNode; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: row, alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      {icon && <Icon name={icon} size={22} color={danger ? c.danger : c.primary} />}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyB" color={danger ? c.danger : undefined}>{title}</T>
        {subtitle ? <T v="small" muted>{subtitle}</T> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="next" size={18} color={c.muted} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line }} />;
}

/** محتوى قابل للتمرير مع السحب للتحديث */
export function ScrollPage({ children, onRefresh, refreshing = false, bottomGap = 32 }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; bottomGap?: number }) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: bottomGap }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}
