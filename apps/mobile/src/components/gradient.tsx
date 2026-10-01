import { lazy, type ReactNode, Suspense } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { gradientsAvailable } from '@/lib/runtime';

const NativeGradient = gradientsAvailable ? lazy(() => import('@/components/native/linear-gradient')) : null;

export interface GradientProps {
  colors: readonly [string, string, ...string[]];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
}

/**
 * Linear gradient behind `children`. The native gradient is only a painted background layer that
 * can never receive touches: on Android its native view swallowed taps meant for the button or card
 * around it. A plain View holds the layout and the children, so touches behave like any View.
 * On app builds without the gradient module it is a solid fill of the first colour.
 */
export function Gradient({ colors, start = { x: 0, y: 0 }, end = { x: 1, y: 1 }, style, children, pointerEvents }: GradientProps) {
  return (
    <View style={[{ backgroundColor: colors[0] }, styles.clip, style]} pointerEvents={pointerEvents}>
      {NativeGradient ? (
        <View style={styles.layer} pointerEvents="none">
          <Suspense fallback={null}>
            <NativeGradient colors={colors} start={start} end={end} style={styles.fill} pointerEvents="none" />
          </Suspense>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  fill: { flex: 1 },
});
