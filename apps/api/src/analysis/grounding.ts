/**
 * Guards against LLM hallucination: a correction is kept only if what it quotes is really in the
 * user's turn. Also converts bands to the 0–100 display scores.
 */
import type { SkillKey } from '@speakai/contracts';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when `quote` appears (modulo case, punctuation and spacing) in `said`. */
export function quotedIn(quote: string, said: string): boolean {
  const q = normalize(quote);
  return q.length > 0 && normalize(said).includes(q);
}

export interface GroundableError {
  turnSeq: number;
  original: string;
  corrected: string;
}

/**
 * Keeps items that (a) quote the user's actual words from that turn (or, if the model picked the
 * wrong turn, any user turn), and (b) actually change something.
 */
export function groundQuoted<T extends { turnSeq: number }>(
  items: readonly T[],
  userTurns: ReadonlyMap<number, string>,
  quote: (item: T) => string,
  replacement: (item: T) => string,
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let dropped = 0;
  for (const e of items) {
    if (normalize(quote(e)) === normalize(replacement(e))) {
      dropped++;
      continue;
    }
    const inTurn = userTurns.get(e.turnSeq);
    if (inTurn !== undefined && quotedIn(quote(e), inTurn)) {
      kept.push(e);
      continue;
    }
    const other = [...userTurns.entries()].find(([, text]) => quotedIn(quote(e), text));
    if (other) kept.push({ ...e, turnSeq: other[0] });
    else dropped++;
  }
  return { kept, dropped };
}

export function groundErrors<T extends GroundableError>(errors: readonly T[], userTurns: ReadonlyMap<number, string>): { kept: T[]; dropped: number } {
  return groundQuoted(errors, userTurns, (e) => e.original, (e) => e.corrected);
}

/** Band 1–5 → 0–100 in steps of 5 (1→20, 2→40, 3→60, 4→80, 5→95): coarse on purpose (PRD §28, no fake precision). */
export function bandToScore(band: number): number {
  return ({ 1: 20, 2: 40, 3: 60, 4: 80, 5: 95 } as Record<number, number>)[band] ?? 60;
}

/** Same scale for smoothed (fractional) bands, e.g. on the Progress screen: interpolates the table above. */
export function smoothedBandToScore(band: number): number {
  const points = [20, 40, 60, 80, 95];
  const b = Math.min(5, Math.max(1, band));
  const lo = Math.floor(b);
  const hi = Math.min(5, lo + 1);
  return Math.round(points[lo - 1]! + (points[hi - 1]! - points[lo - 1]!) * (b - lo));
}

const WEIGHTS: Record<SkillKey, number> = { grammar: 0.25, vocabulary: 0.2, fluency: 0.25, conversation: 0.2, clarity: 0.1 };

export function overallScore(bands: Record<SkillKey, number>): number {
  const raw = (Object.keys(WEIGHTS) as SkillKey[]).reduce((sum, k) => sum + WEIGHTS[k] * bandToScore(bands[k]), 0);
  return Math.round(raw / 5) * 5;
}
