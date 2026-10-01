import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface Visual {
  icon: IconName;
  /** Identity colour; readable on both light and dark backgrounds. */
  tint: string;
}

/** Each scenario gets its own icon and colour, so it is recognisable at a glance. */
const SCENARIOS: Record<string, Visual> = {
  'friendly-conversation': { icon: 'cafe', tint: '#14B8A6' },
  'job-interview': { icon: 'briefcase', tint: '#6366F1' },
  'client-meeting': { icon: 'people', tint: '#0EA5E9' },
  debate: { icon: 'mic', tint: '#F97316' },
  bargaining: { icon: 'pricetags', tint: '#EC4899' },
  'mission-get-the-job': { icon: 'briefcase', tint: '#6366F1' },
  'mission-negotiate-raise': { icon: 'trending-up', tint: '#22C55E' },
  'mission-angry-customer': { icon: 'thunderstorm', tint: '#EF4444' },
  'mission-hotel-problem': { icon: 'bed', tint: '#0EA5E9' },
  'mission-win-the-debate': { icon: 'mic', tint: '#F97316' },
  'mission-bargain': { icon: 'pricetags', tint: '#EC4899' },
};

const FALLBACK_TINTS = ['#6366F1', '#14B8A6', '#F97316', '#EC4899', '#0EA5E9', '#A855F7', '#EAB308'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function scenarioVisual(slug: string | undefined): Visual {
  return (slug && SCENARIOS[slug]) || { icon: 'chatbubbles', tint: FALLBACK_TINTS[hash(slug ?? '') % FALLBACK_TINTS.length]! };
}

const PERSONAS: Record<string, string> = { maya: '#EC4899', rohan: '#0EA5E9', priya: '#A855F7', arjun: '#F59E0B' };

/** Avatar colour for an AI partner (by slug, else derived from the name). */
export function personaTint(slugOrName: string): string {
  return PERSONAS[slugOrName.toLowerCase()] ?? FALLBACK_TINTS[hash(slugOrName) % FALLBACK_TINTS.length]!;
}

/** "#RRGGBB" + alpha → "rgba(…)". */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Blends two "#RRGGBB" colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.slice(1), 16);
  const pb = Number.parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
