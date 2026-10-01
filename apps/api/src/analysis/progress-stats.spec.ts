import { describe, expect, it } from 'vitest';
import { type ConversationSignals, confidenceIndicators, emaBand, localDateKey, mistakeTrends, practiceSummary, shiftDateKey, trendOf } from './progress-stats.js';

const IST = 'Asia/Kolkata';
const at = (iso: string) => new Date(iso);

describe('date keys', () => {
  it('uses the local day, not UTC', () => {
    expect(localDateKey(at('2026-09-29T20:00:00Z'), IST)).toBe('2026-09-30'); // 01:30 IST
    expect(localDateKey(at('2026-09-29T20:00:00Z'), 'UTC')).toBe('2026-09-29');
  });
  it('shifts across month and year ends', () => {
    expect(shiftDateKey('2026-03-01', 1)).toBe('2026-02-28');
    expect(shiftDateKey('2027-01-01', 1)).toBe('2026-12-31');
  });
});

describe('practiceSummary', () => {
  const now = at('2026-09-30T10:00:00Z'); // 15:30 IST
  const day = (d: string, seconds = 120) => ({ createdAt: at(`${d}T06:00:00Z`), seconds });

  it('builds a 28-day calendar ending today, summing each local day', () => {
    const s = practiceSummary([day('2026-09-30'), day('2026-09-30', 60), day('2026-09-03')], IST, now);
    expect(s.calendar).toHaveLength(28);
    expect(s.calendar.at(-1)).toEqual({ date: '2026-09-30', seconds: 180 });
    expect(s.calendar[0]).toEqual({ date: '2026-09-03', seconds: 120 });
  });

  it('counts the current streak including today', () => {
    const s = practiceSummary([day('2026-09-28'), day('2026-09-29'), day('2026-09-30')], IST, now);
    expect(s.streak).toEqual({ current: 3, longest: 3, practisedToday: true });
  });

  it('keeps the streak alive until a whole day is missed', () => {
    expect(practiceSummary([day('2026-09-28'), day('2026-09-29')], IST, now).streak).toEqual({ current: 2, longest: 2, practisedToday: false });
    expect(practiceSummary([day('2026-09-27'), day('2026-09-28')], IST, now).streak.current).toBe(0);
  });

  it('finds the longest run anywhere and ignores zero-second records', () => {
    const s = practiceSummary([day('2026-08-01'), day('2026-08-02'), day('2026-08-03'), day('2026-08-04'), day('2026-09-30'), day('2026-09-29', 0)], IST, now);
    expect(s.streak).toEqual({ current: 1, longest: 4, practisedToday: true });
  });
});

describe('trendOf', () => {
  it('needs both values', () => expect(trendOf(1, null, true)).toBeNull());
  it('treats small changes as steady', () => expect(trendOf(1.05, 1, true)).toBe('STEADY'));
  it('respects direction', () => {
    expect(trendOf(0.8, 1.6, false)).toBe('BETTER');
    expect(trendOf(0.8, 1.6, true)).toBe('WORSE');
  });
  it('uses the floor so tiny absolute changes near zero stay steady', () => {
    expect(trendOf(0.1, 0, false, 1)).toBe('WORSE');
    expect(trendOf(0.05, 0, false, 1)).toBe('STEADY');
  });
});

describe('confidenceIndicators', () => {
  const sig = (over: Partial<ConversationSignals> = {}): ConversationSignals => ({
    latencyP50Ms: 1500,
    meanUtteranceWords: 5,
    longPauseCount: 4,
    userSpeakingMs: 120_000,
    fillersPerMinute: 3,
    askedQuestions: false,
    ...over,
  });

  it('shows only recent values until there is something to compare', () => {
    const out = confidenceIndicators([sig(), sig()]);
    expect(out.find((i) => i.key === 'RESPONSE_SPEED')).toEqual({ key: 'RESPONSE_SPEED', recent: 1.5, earlier: null, trend: null });
  });

  it('compares the last three conversations with the three before', () => {
    const improved = sig({ latencyP50Ms: 900, meanUtteranceWords: 10, longPauseCount: 1, fillersPerMinute: 1, askedQuestions: true });
    const out = Object.fromEntries(confidenceIndicators([sig(), sig(), sig(), improved, improved, improved]).map((i) => [i.key, i]));
    expect(out.RESPONSE_SPEED).toMatchObject({ recent: 0.9, earlier: 1.5, trend: 'BETTER' });
    expect(out.ANSWER_LENGTH).toMatchObject({ recent: 10, earlier: 5, trend: 'BETTER' });
    expect(out.LONG_PAUSES).toMatchObject({ recent: 0.5, earlier: 2, trend: 'BETTER' });
    expect(out.FILLERS).toMatchObject({ trend: 'BETTER' });
    expect(out.ASKING_QUESTIONS).toMatchObject({ recent: 1, earlier: 0, trend: 'BETTER' });
  });

  it('skips missing measurements instead of counting them as zero', () => {
    const out = confidenceIndicators([sig({ latencyP50Ms: null, userSpeakingMs: 3_000, askedQuestions: null })]);
    expect(out.find((i) => i.key === 'RESPONSE_SPEED')?.recent).toBeNull();
    expect(out.find((i) => i.key === 'LONG_PAUSES')?.recent).toBeNull(); // too little speech to be meaningful
    expect(out.find((i) => i.key === 'ASKING_QUESTIONS')?.recent).toBeNull();
  });
});

describe('mistakeTrends', () => {
  it('compares mistakes per conversation, recent vs before', () => {
    const before = Array.from({ length: 5 }, () => ['ARTICLES', 'ARTICLES', 'VERB_TENSE']);
    const after = Array.from({ length: 5 }, () => ['VERB_TENSE', 'PREPOSITIONS']);
    const t = mistakeTrends([...before, ...after]);
    expect(t.get('ARTICLES')).toBe('BETTER');
    expect(t.get('VERB_TENSE')).toBe('STEADY');
    expect(t.get('PREPOSITIONS')).toBe('WORSE');
  });
  it('has no trend with too few conversations', () => expect(mistakeTrends([['ARTICLES']]).get('ARTICLES')).toBeNull());
});

describe('emaBand', () => {
  it('weights recent bands more', () => {
    expect(emaBand([], 0.35)).toBeNull();
    expect(emaBand([3], 0.35)).toBe(3);
    expect(emaBand([2, 4], 0.5)).toBe(3);
  });
});
