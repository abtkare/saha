/**
 * شاشة البداية المتحركة — نفس توقيتات شاشة الموقع (saha.css ← sp-*):
 * رسم خطوط الملعب ← ظهور الرمز ورسم حرف «س» ← كرة تسقط وتدور وترتد مع ظل وموجة ذهبية ←
 * «ساحة» ← الشعار النصي ← الشارات الثلاث ← شريط التحميل. اللمس يتخطاها.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Polygon } from 'react-native-svg';
import { brand as brandText } from '@saha/ui';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS } from '@saha/shared';
import { brand } from '../theme';
import { ff, row } from '../theme';
import { MARK_PATH } from './icons';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

const PATCHES = [
  '0.00,-3.70 3.52,-1.14 2.17,2.99 -2.17,2.99 -3.52,-1.14',
  '3.53,-4.85 2.29,-8.66 5.53,-11.00 8.76,-8.66 7.52,-4.85',
  '5.71,1.85 8.94,-0.50 12.17,1.85 10.94,5.66 6.94,5.66',
  '0.00,6.00 3.23,8.35 2.00,12.15 -2.00,12.15 -3.23,8.35',
  '-5.71,1.85 -6.94,5.66 -10.94,5.66 -12.17,1.85 -8.94,-0.50',
  '-3.53,-4.85 -7.52,-4.85 -8.76,-8.66 -5.53,-11.00 -2.29,-8.66',
];

const MARK = 150;
const K = MARK / 120;
const BALL_X = 82 * K, BALL_Y = 34 * K, BALL_R = 10 * K;

const ease = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.2, 0.8, 0.2, 1);

export function Splash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const v = useRef({
    pitch: new Animated.Value(0), pitch2: new Animated.Value(0), pop: new Animated.Value(0), s: new Animated.Value(0),
    ball: new Animated.Value(0), ring: new Animated.Value(0), word: new Animated.Value(0), tag: new Animated.Value(0),
    c1: new Animated.Value(0), c2: new Animated.Value(0), c3: new Animated.Value(0), foot: new Animated.Value(0), bar: new Animated.Value(0),
    fade: new Animated.Value(1),
  }).current;
  const done = useRef(false);

  const hide = () => {
    if (done.current) return;
    done.current = true;
    Animated.timing(v.fade, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const t = (a: Animated.Value, duration: number, delay: number, easing = out, native = true) =>
      Animated.timing(a, { toValue: 1, duration, delay, easing, useNativeDriver: native });
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        Object.values(v).forEach((a) => a !== v.fade && a.setValue(1));
        timer = setTimeout(hide, 900);
        return;
      }
      Animated.parallel([
        t(v.pitch, 1800, 50, ease, false), t(v.pitch2, 1800, 350, ease, false),
        t(v.pop, 1000, 200), t(v.s, 1150, 350, ease, false),
        t(v.ball, 1050, 1250, Easing.bezier(0.3, 0, 0.3, 1)), t(v.ring, 900, 1750, Easing.out(Easing.quad)),
        t(v.word, 750, 1750), t(v.tag, 600, 2300, Easing.out(Easing.quad)),
        t(v.c1, 500, 2550), t(v.c2, 500, 2700), t(v.c3, 500, 2850),
        t(v.foot, 600, 2600, Easing.out(Easing.quad)), t(v.bar, 3200, 400, Easing.bezier(0.4, 0, 0.2, 1)),
      ]).start();
      timer = setTimeout(hide, 3900);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = [0, 0.35, 0.45, 0.55, 0.7, 0.84, 1];
  const ballY = v.ball.interpolate({ inputRange: k, outputRange: [-190, -60, 0, 0, -26, 0, 0] });
  const sx = v.ball.interpolate({ inputRange: k, outputRange: [0.7, 0.9, 1, 1.3, 0.92, 1.12, 1] });
  const sy = v.ball.interpolate({ inputRange: k, outputRange: [0.7, 0.9, 1, 0.7, 1.08, 0.88, 1] });
  const ballOp = v.ball.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
  const spin = v.ball.interpolate({ inputRange: [0, 1], outputRange: ['-420deg', '0deg'] });
  const shadowOp = v.ball.interpolate({ inputRange: [0, 0.45, 0.7, 1], outputRange: [0, 0.55, 0.25, 0.45] });
  const shadowS = v.ball.interpolate({ inputRange: [0, 0.45, 0.7, 1], outputRange: [0.3, 1.2, 0.8, 1] });
  const up = (a: Animated.Value) => ({ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] });

  const r = 118 * (width / 390);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: brand.green, opacity: v.fade, zIndex: 100 }]} accessibilityLabel={`${brandText.name} — ${brandText.tagline}`}>
      <Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityRole="button" accessibilityLabel="تخطَّ">
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <ACircle cx={width / 2} cy={height / 2} r={r} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.14}
            strokeDasharray={760} strokeDashoffset={v.pitch.interpolate({ inputRange: [0, 1], outputRange: [760, 0] })} />
          <APath d={`M${-width} ${height / 2} H${width * 2}`} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.14}
            strokeDasharray={760 * 3} strokeDashoffset={v.pitch2.interpolate({ inputRange: [0, 1], outputRange: [760 * 3, 0] })} />
        </Svg>

        <View style={styles.center} pointerEvents="none">
          <Animated.View style={{ width: MARK, height: MARK, opacity: v.pop, transform: [{ scale: v.pop.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }}>
            <Svg width={MARK} height={MARK} viewBox="0 0 120 120">
              <APath d={MARK_PATH} fill="none" stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={220} strokeDashoffset={v.s.interpolate({ inputRange: [0, 1], outputRange: [220, 0] })} />
            </Svg>
            {/* الظل تحت الكرة */}
            <Animated.View style={{ position: 'absolute', left: BALL_X - 9 * K, top: 45 * K - 2 * K, width: 18 * K, height: 4 * K, borderRadius: 9 * K, backgroundColor: '#062E21', opacity: shadowOp, transform: [{ scale: shadowS }] }} />
            {/* الموجة الذهبية */}
            <Animated.View style={{
              position: 'absolute', left: BALL_X - BALL_R, top: BALL_Y - BALL_R, width: BALL_R * 2, height: BALL_R * 2, borderRadius: BALL_R, borderWidth: 2.5, borderColor: brand.gold,
              opacity: v.ring.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: v.ring.interpolate({ inputRange: [0, 1], outputRange: [1, 3.4] }) }],
            }} />
            {/* الكرة */}
            <Animated.View style={{ position: 'absolute', left: BALL_X - BALL_R, top: BALL_Y - BALL_R, width: BALL_R * 2, height: BALL_R * 2, opacity: ballOp, transform: [{ translateY: ballY }, { scaleX: sx }, { scaleY: sy }, { rotate: spin }] }}>
              <Svg width={BALL_R * 2} height={BALL_R * 2} viewBox="-10 -10 20 20">
                <Defs><ClipPath id="ballClip"><Circle cx={0} cy={0} r={10} /></ClipPath></Defs>
                <Circle r={10} fill="#FFFFFF" />
                <G clipPath="url(#ballClip)" fill="#0E1A24">{PATCHES.map((p) => <Polygon key={p} points={p} />)}</G>
                <Path d="M0 -3.7 V-6 M3.52 -1.14 L5.71 -1.85 M2.17 2.99 L3.53 4.85 M-2.17 2.99 L-3.53 4.85 M-3.52 -1.14 L-5.71 -1.85" fill="none" stroke="#0E1A24" strokeWidth={0.8} strokeLinecap="round" />
                <Circle r={10} fill="none" stroke="#0E1A24" strokeWidth={0.9} />
                <Ellipse cx={-3.5} cy={-5} rx={3.2} ry={1.8} fill="#FFFFFF" opacity={0.35} />
              </Svg>
            </Animated.View>
          </Animated.View>

          <Animated.Text style={[ff('display'), styles.word, { opacity: v.word, transform: [{ translateX: v.word.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }]}>{brandText.name}</Animated.Text>
          <Animated.Text style={[ff('semi'), styles.tag, up(v.tag)]}>{brandText.tagline}</Animated.Text>
          <View style={styles.chips}>
            {TOURNAMENT_KINDS.map((kind, i) => (
              <Animated.View key={kind} style={[styles.chip, up([v.c1, v.c2, v.c3][i])]}>
                <Animated.Text style={[ff('semi'), { color: '#FFFFFF', fontSize: 13 }]}>{TOURNAMENT_KIND_LABELS[kind]}</Animated.Text>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View style={[styles.foot, up(v.foot)]} pointerEvents="none">
          <View style={styles.bar}>
            <Animated.View style={{ height: 4, width: 120, backgroundColor: brand.gold, transform: [{ translateX: v.bar.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }, { scaleX: v.bar }] }} />
          </View>
          <Animated.Text style={[ff('body'), { color: '#CFE5DC', fontSize: 12 }]}>جمعية الميثاق الأعظم</Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 24, paddingBottom: 40 },
  word: { color: '#FFFFFF', fontSize: 64, lineHeight: 76, textAlign: 'center' },
  tag: { color: '#FFFFFF', fontSize: 17, marginTop: 6, textAlign: 'center', writingDirection: 'rtl' },
  chips: { flexDirection: row, flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  chip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center', gap: 14 },
  bar: { width: 120, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
});
