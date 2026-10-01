import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Gradient } from '@/components/gradient';
import { Backdrop } from '@/components/vector';
import { mix, personaTint, scenarioVisual, withAlpha } from '@/lib/visuals';
import { radius, useColors } from '@/theme';

/**
 * Scenario "illustration": the scenario's icon on a softly graded tile with a glow shape.
 * Drawn in code, so it needs no image assets and adapts to light/dark.
 */
export function ScenarioArt({ slug, size = 52, style }: { slug: string | undefined; size?: number; style?: ViewStyle }) {
  const c = useColors();
  const v = scenarioVisual(slug);
  const k = c.scheme === 'dark' ? 1 : 0.7;
  return (
    <Gradient
      colors={[withAlpha(v.tint, 0.34 * k), withAlpha(v.tint, 0.1 * k)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.3 }, ...(style ? [style] : [])]}
    >
      <View style={[styles.blob, { width: size * 0.9, height: size * 0.9, top: -size * 0.35, right: -size * 0.3, backgroundColor: withAlpha(v.tint, 0.18 * k) }]} />
      <Ionicons name={v.icon} size={size * 0.46} color={v.tint} />
    </Gradient>
  );
}

/** Wide banner for a scenario's header: graded colour, waves and rings, big icon, content on top. */
export function ScenarioBanner({ slug, height = 150, children }: { slug: string | undefined; height?: number; children?: ReactNode }) {
  const c = useColors();
  const v = scenarioVisual(slug);
  const [width, setWidth] = useState(0);
  const k = c.scheme === 'dark' ? 1 : 0.75;
  return (
    <View style={[styles.banner, { height }]} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      <Gradient
        colors={[withAlpha(v.tint, 0.42 * k), withAlpha(v.tint, 0.14 * k), withAlpha(v.tint, 0.06 * k)]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.fill}
      />
      <View style={[styles.blob, { width: height * 1.3, height: height * 1.3, top: -height * 0.55, right: -height * 0.35, backgroundColor: withAlpha(v.tint, 0.12 * k) }]} />
      <Backdrop tint={v.tint} width={width} height={height} />
      <View style={[styles.bannerIconWrap, { width: height * 0.5, height: height * 0.5, borderRadius: height * 0.25, backgroundColor: withAlpha(v.tint, 0.2 * k) }]}>
        <Ionicons name={v.icon} size={height * 0.26} color={v.tint} />
      </View>
      <View style={styles.bannerContent}>{children}</View>
    </View>
  );
}

/** Round avatar for an AI partner: initial on a gradient of their colour. */
export function PersonaAvatar({ name, slug, size = 44 }: { name: string; slug?: string; size?: number }) {
  const tint = personaTint(slug ?? name);
  return (
    <Gradient colors={[mix(tint, '#ffffff', 0.25), tint, mix(tint, '#000000', 0.2)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase()}</Text>
    </Gradient>
  );
}

/** Circular icon badge, e.g. in section headers and list rows. */
export function IconBadge({ name, tint, size = 36 }: { name: React.ComponentProps<typeof Ionicons>['name']; tint: string; size?: number }) {
  const c = useColors();
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(tint, c.scheme === 'dark' ? 0.2 : 0.12) }]}>
      <Ionicons name={name} size={size * 0.5} color={tint} />
    </View>
  );
}

const LOGO = require('../../assets/images/logo-mark.png') as number;

/** The Talkel logo mark (two speech bubbles around a voice wave). */
export function BrandMark({ size = 64 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size * 1.18, height: size }} resizeMode="contain" accessibilityLabel="Talkel" />;
}

/** Logo + "Talkel" wordmark + tagline, as on the brand artwork ("el" in the brand cyan). */
export function BrandLockup({ size = 72, tagline = true }: { size?: number; tagline?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.lockup}>
      <BrandMark size={size} />
      <Text style={[styles.wordmark, { color: c.text, fontSize: size * 0.5 }]} accessibilityRole="header">
        Talk<Text style={{ color: c.scheme === 'dark' ? '#22D3EE' : '#0EA5E9' }}>el</Text>
      </Text>
      {tagline ? <Text style={[styles.tagline, { color: c.textMuted }]}>Your AI Conversation Partner</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  lockup: { alignItems: 'center', gap: 6 },
  wordmark: { fontWeight: '900', letterSpacing: -1 },
  tagline: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: radius.pill },
  banner: { borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end' },
  bannerIconWrap: { position: 'absolute', top: 18, right: 18, alignItems: 'center', justifyContent: 'center' },
  bannerContent: { padding: 20, gap: 4 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '700' },
  badge: { alignItems: 'center', justifyContent: 'center' },
});
