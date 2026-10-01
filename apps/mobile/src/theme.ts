/**
 * Design tokens. Light and dark palettes follow the phone's setting (PRD §59: calm, voice-first).
 * Components read colours through useColors() / makeStyles(), never a fixed palette, so a
 * system theme change restyles the whole app.
 */
import { Platform, useColorScheme, type ViewStyle } from 'react-native';

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  /** Gradient partner of accent (primary buttons, highlights). */
  accent2: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  /** Live call: who is speaking. */
  userSpeaking: string;
  aiSpeaking: string;
  /** How cards stand out from the background (a hairline border; plus a soft shadow on iOS light). */
  elevation: ViewStyle;
}

const dark: Palette = {
  scheme: 'dark',
  bg: '#0B0D12',
  surface: '#151821',
  surfaceRaised: '#1F2330',
  border: '#272C39',
  text: '#F3F4F7',
  textMuted: '#9CA3B0',
  textFaint: '#666D7A',
  accent: '#7C8CFF',
  accent2: '#B07CFF',
  accentSoft: 'rgba(124,140,255,0.16)',
  onAccent: '#FFFFFF',
  success: '#3DD68C',
  successSoft: 'rgba(61,214,140,0.14)',
  danger: '#FF5C61',
  dangerSoft: 'rgba(255,92,97,0.14)',
  warning: '#F5B544',
  warningSoft: 'rgba(245,181,68,0.14)',
  userSpeaking: '#3DD68C',
  aiSpeaking: '#7C8CFF',
  elevation: { borderWidth: 1, borderColor: '#1E222D' },
};

const light: Palette = {
  scheme: 'light',
  bg: '#F4F5F9',
  surface: '#FFFFFF',
  surfaceRaised: '#ECEEF4',
  border: '#E1E4EC',
  text: '#13151B',
  textMuted: '#5D6472',
  textFaint: '#9AA0AC',
  accent: '#4B5BE8',
  accent2: '#8B5CF6',
  accentSoft: 'rgba(75,91,232,0.10)',
  onAccent: '#FFFFFF',
  success: '#12965F',
  successSoft: 'rgba(18,150,95,0.10)',
  danger: '#DC3B41',
  dangerSoft: 'rgba(220,59,65,0.09)',
  warning: '#B97806',
  warningSoft: 'rgba(185,120,6,0.10)',
  userSpeaking: '#12965F',
  aiSpeaking: '#4B5BE8',
  // Android's elevation shadow draws grey, hard-edged corners on light backgrounds, so cards use
  // a soft border there (iOS gets a gentle real shadow as well).
  elevation: Platform.select<ViewStyle>({
    ios: { borderWidth: 1, borderColor: '#E8EAF0', shadowColor: '#1B2240', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 } },
    default: { borderWidth: 1, borderColor: '#E4E7EE' },
  }),
};

export const palettes = { light, dark } as const;

export function useColors(): Palette {
  return useColorScheme() === 'light' ? light : dark;
}

/**
 * Theme-aware StyleSheet: `const useStyles = makeStyles((c) => StyleSheet.create({...}))`,
 * then `const s = useStyles()` inside the component. Built once per palette.
 */
export function makeStyles<T>(factory: (c: Palette) => T): (forced?: Palette) => T {
  const cache = new Map<Palette, T>();
  return function useStyles(forced?: Palette): T {
    const current = useColors();
    const c = forced ?? current;
    let styles = cache.get(c);
    if (!styles) {
      styles = factory(c);
      cache.set(c, styles);
    }
    return styles;
  };
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
