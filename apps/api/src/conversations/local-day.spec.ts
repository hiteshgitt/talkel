import { describe, expect, it } from 'vitest';
import { isValidTimeZone, nextLocalMidnight, startOfLocalDay } from './local-day.js';

describe('local day boundaries', () => {
  it('uses India midnight, not UTC midnight', () => {
    // 2026-09-30 01:00 IST = 2026-09-29 19:30 UTC → the IST day started at 2026-09-29 18:30 UTC.
    const now = new Date('2026-09-29T19:30:00Z');
    expect(startOfLocalDay(now, 'Asia/Kolkata').toISOString()).toBe('2026-09-29T18:30:00.000Z');
    expect(nextLocalMidnight(now, 'Asia/Kolkata').toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('works just before and exactly at local midnight', () => {
    expect(startOfLocalDay(new Date('2026-09-30T18:29:59Z'), 'Asia/Kolkata').toISOString()).toBe('2026-09-29T18:30:00.000Z');
    expect(startOfLocalDay(new Date('2026-09-30T18:30:00Z'), 'Asia/Kolkata').toISOString()).toBe('2026-09-30T18:30:00.000Z');
  });

  it('handles DST zones (London, day after clocks go back)', () => {
    // 2026-10-25: BST ends. At 2026-10-26 10:00Z London is on GMT, midnight = 00:00Z.
    expect(startOfLocalDay(new Date('2026-10-26T10:00:00Z'), 'Europe/London').toISOString()).toBe('2026-10-26T00:00:00.000Z');
    // In summer London midnight is 23:00Z the previous day.
    expect(startOfLocalDay(new Date('2026-07-01T10:00:00Z'), 'Europe/London').toISOString()).toBe('2026-06-30T23:00:00.000Z');
  });

  it('validates time zone names', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
