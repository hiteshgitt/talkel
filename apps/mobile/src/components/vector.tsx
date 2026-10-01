import { lazy, Suspense, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { svgAvailable } from '@/lib/runtime';
import { makeStyles, radius, useColors } from '@/theme';

// react-native-svg throws on import when the native module is missing, so it is loaded lazily
// and only on app builds that include it; older builds get the plain-view fallbacks below.
const Svg = svgAvailable
  ? {
      ScoreGauge: lazy(() => import('@/components/native/svg-art').then((m) => ({ default: m.ScoreGauge }))),
      Sparkline: lazy(() => import('@/components/native/svg-art').then((m) => ({ default: m.Sparkline }))),
      SceneBackdrop: lazy(() => import('@/components/native/svg-art').then((m) => ({ default: m.SceneBackdrop }))),
    }
  : null;

/** Score in a circular gauge (a coloured ring on older builds). */
export function Gauge({ value, size = 84, stroke = 8, color, colorEnd, label }: { value: number; size?: number; stroke?: number; color: string; colorEnd?: string; label?: string }) {
  const s = useStyles();
  const c = useColors();
  const ring = <View style={[s.ring, { width: size, height: size, borderRadius: size / 2, borderWidth: stroke * 0.7, borderColor: color }]} />;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={label ?? `Score ${value}`}>
      {Svg ? (
        <Suspense fallback={ring}>
          <Svg.ScoreGauge value={value} size={size} stroke={stroke} color={color} colorEnd={colorEnd ?? color} track={c.surfaceRaised} />
        </Suspense>
      ) : (
        ring
      )}
      <View style={s.center}>
        <Text style={[s.value, { fontSize: size * 0.32 }]}>{value}</Text>
      </View>
    </View>
  );
}

/** Line chart of 0–100 values, filling the available width; nothing on older builds. */
export function TrendLine({ values, height = 72, color }: { values: readonly number[]; height?: number; color: string }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  if (!Svg || values.length < 2) return null;
  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Suspense fallback={null}>
          <Svg.Sparkline values={values} width={width} height={height} color={color} />
        </Suspense>
      ) : null}
    </View>
  );
}

/** Decorative waves and rings behind a banner; nothing on older builds. */
export function Backdrop({ tint, width, height }: { tint: string; width: number; height: number }) {
  const c = useColors();
  if (!Svg || width === 0) return null;
  return (
    <Suspense fallback={null}>
      <Svg.SceneBackdrop tint={tint} width={width} height={height} strength={c.scheme === 'dark' ? 1 : 0.75} />
    </Suspense>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    ring: { position: 'absolute' },
    center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
    value: { color: c.text, fontWeight: '800' },
  }),
);
