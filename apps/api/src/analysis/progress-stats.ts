/**
 * Pure calculations behind the Progress screen: practice calendar and streaks, confidence
 * indicators and mistake trends. Kept free of I/O so it is easy to test.
 */
import type { ConfidenceIndicator, ConfidenceKey, GrammarCategory, Trend } from '@speakai/contracts';

/** "YYYY-MM-DD" of an instant in the user's time zone. */
export function localDateKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** The date key `days` calendar days before `key` (pure date arithmetic, no time zones involved). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

export interface PracticeRecord {
  createdAt: Date;
  seconds: number;
}

export interface PracticeSummary {
  calendar: Array<{ date: string; seconds: number }>;
  streak: { current: number; longest: number; practisedToday: boolean };
}

/**
 * Days practised per local day. The current streak still counts if today has no practice yet
 * (it only breaks once a whole day is missed).
 */
export function practiceSummary(records: readonly PracticeRecord[], timeZone: string, now: Date, calendarDays = 28): PracticeSummary {
  const perDay = new Map<string, number>();
  for (const r of records) {
    if (r.seconds <= 0) continue;
    const key = localDateKey(r.createdAt, timeZone);
    perDay.set(key, (perDay.get(key) ?? 0) + r.seconds);
  }
  const today = localDateKey(now, timeZone);
  const calendar = Array.from({ length: calendarDays }, (_, i) => {
    const date = shiftDateKey(today, calendarDays - 1 - i);
    return { date, seconds: perDay.get(date) ?? 0 };
  });

  const practisedToday = perDay.has(today);
  let current = 0;
  for (let day = practisedToday ? today : shiftDateKey(today, 1); perDay.has(day); day = shiftDateKey(day, 1)) current++;

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...perDay.keys()].sort()) {
    run = prev !== null && shiftDateKey(day, 1) === prev ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { calendar, streak: { current, longest, practisedToday } };
}

/** One analysed conversation's measurements, oldest first when passed as a list. */
export interface ConversationSignals {
  latencyP50Ms: number | null;
  meanUtteranceWords: number;
  longPauseCount: number;
  userSpeakingMs: number;
  fillersPerMinute: number | null;
  askedQuestions: boolean | null;
}

/** Compare this many recent conversations with (up to) this many before them. */
export const TREND_WINDOW = 3;

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Relative change needed before we call something better or worse (avoids noise). */
const MIN_CHANGE = 0.1;

export function trendOf(recent: number | null, earlier: number | null, higherIsBetter: boolean, absoluteFloor = 0): Trend | null {
  if (recent === null || earlier === null) return null;
  const diff = recent - earlier;
  const scale = Math.max(Math.abs(earlier), absoluteFloor);
  if (scale === 0 || Math.abs(diff) / scale < MIN_CHANGE) return 'STEADY';
  return diff > 0 === higherIsBetter ? 'BETTER' : 'WORSE';
}

const round = (x: number | null, digits: number) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

interface IndicatorSpec {
  key: ConfidenceKey;
  value: (s: ConversationSignals) => number | null;
  higherIsBetter: boolean;
  digits: number;
  /** Differences smaller than this fraction of it count as steady even from a near-zero start. */
  floor: number;
}

const INDICATORS: IndicatorSpec[] = [
  { key: 'RESPONSE_SPEED', value: (s) => (s.latencyP50Ms === null ? null : s.latencyP50Ms / 1000), higherIsBetter: false, digits: 1, floor: 0.5 },
  { key: 'ANSWER_LENGTH', value: (s) => (s.meanUtteranceWords > 0 ? s.meanUtteranceWords : null), higherIsBetter: true, digits: 1, floor: 2 },
  {
    key: 'LONG_PAUSES',
    value: (s) => (s.userSpeakingMs >= 10_000 ? s.longPauseCount / (s.userSpeakingMs / 60_000) : null),
    higherIsBetter: false,
    digits: 1,
    floor: 1,
  },
  { key: 'FILLERS', value: (s) => s.fillersPerMinute, higherIsBetter: false, digits: 1, floor: 1 },
  { key: 'ASKING_QUESTIONS', value: (s) => (s.askedQuestions === null ? null : s.askedQuestions ? 1 : 0), higherIsBetter: true, digits: 2, floor: 0.34 },
];

/** Recent conversations vs the ones before them; with fewer than two windows' worth, only `recent`. */
export function confidenceIndicators(signals: readonly ConversationSignals[]): ConfidenceIndicator[] {
  const recentSet = signals.slice(-TREND_WINDOW);
  const earlierSet = signals.length >= TREND_WINDOW + 1 ? signals.slice(-2 * TREND_WINDOW, -TREND_WINDOW) : [];
  return INDICATORS.map((spec) => {
    const values = (set: readonly ConversationSignals[]) => set.map(spec.value).filter((v): v is number => v !== null);
    const recent = mean(values(recentSet));
    const earlier = mean(values(earlierSet));
    return {
      key: spec.key,
      recent: round(recent, spec.digits),
      earlier: round(earlier, spec.digits),
      trend: trendOf(recent, earlier, spec.higherIsBetter, spec.floor),
    };
  });
}

/**
 * Per mistake type: fewer per conversation recently (BETTER) or more (WORSE)? `perConversation`
 * holds each analysed conversation's mistake categories, oldest first.
 */
export function mistakeTrends(perConversation: readonly (readonly string[])[], window = 5): Map<GrammarCategory | string, Trend | null> {
  const recent = perConversation.slice(-window);
  const earlier = perConversation.length > window ? perConversation.slice(-2 * window, -window) : [];
  const rate = (set: readonly (readonly string[])[], category: string) =>
    set.length ? set.reduce((n, cats) => n + cats.filter((c) => c === category).length, 0) / set.length : null;
  const out = new Map<string, Trend | null>();
  for (const category of new Set(perConversation.flat())) {
    out.set(category, trendOf(rate(recent, category), rate(earlier, category), false, 0.5));
  }
  return out;
}

/** Exponential moving average (the learning profile's formula) over bands, oldest first. */
export function emaBand(bands: readonly number[], alpha: number): number | null {
  let v: number | null = null;
  for (const b of bands) v = v === null ? b : v * (1 - alpha) + b * alpha;
  return v;
}
