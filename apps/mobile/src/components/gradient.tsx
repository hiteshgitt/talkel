import { lazy, type ReactNode, Suspense } from 'react';
import { View, type ViewStyle } from 'react-native';
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

/** Linear gradient; a solid fill of the first colour on app builds without the gradient module. */
export function Gradient({ colors, start = { x: 0, y: 0 }, end = { x: 1, y: 1 }, style, children, pointerEvents }: GradientProps) {
  const fallback = (
    <View style={[{ backgroundColor: colors[0] }, style]} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
  if (!NativeGradient) return fallback;
  return (
    <Suspense fallback={fallback}>
      <NativeGradient colors={colors} start={start} end={end} style={style} pointerEvents={pointerEvents}>
        {children}
      </NativeGradient>
    </Suspense>
  );
}
