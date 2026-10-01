/**
 * Mission rules (pure): the mission spec stored on a scenario version, how a mission attempt is
 * scored, and how passing a level unlocks the next. Kept free of I/O so it is easy to test.
 */
import { MissionGroup, MissionSkill } from '@speakai/contracts';
import { z } from 'zod';

export const MissionSpec = z.object({
  group: MissionGroup,
  aiCharacter: z.string(),
  skills: z.array(MissionSkill).min(1).max(4),
  outcome: z.string(),
});
export type MissionSpec = z.infer<typeof MissionSpec>;

export const MAX_LEVEL = 5;

/** User-facing objectives: the goal's label when it has one. */
export function objectivesOf(goals: unknown): Array<{ id: string; text: string }> {
  return z
    .array(z.object({ id: z.string(), description: z.string(), label: z.string().optional() }))
    .catch([])
    .parse(goals)
    .map((g) => ({ id: g.id, text: g.label ?? g.description }));
}

/**
 * Mission score (0–100, steps of 5): half how well they communicated (the overall score), half how
 * much of the mission they achieved. Simple enough to explain on the result screen.
 */
export function missionScore(overall: number, achieved: number, total: number): number {
  const objectives = total > 0 ? (achieved / total) * 100 : 0;
  return Math.round((0.5 * overall + 0.5 * objectives) / 5) * 5;
}

/** A level is passed when the mission's outcome was a success. */
export function isPassed(result: 'SUCCESS' | 'PARTIAL' | 'FAILED'): boolean {
  return result === 'SUCCESS';
}

export interface ProgressState {
  unlockedLevel: number;
  passedLevels: number[];
  bestScores: Record<string, number>;
  attempts: number;
}

export function applyAttempt(prev: ProgressState | null, level: number, score: number, passed: boolean): ProgressState {
  const p = prev ?? { unlockedLevel: 1, passedLevels: [], bestScores: {}, attempts: 0 };
  const key = String(level);
  return {
    attempts: p.attempts + 1,
    bestScores: { ...p.bestScores, [key]: Math.max(p.bestScores[key] ?? 0, score) },
    passedLevels: passed && !p.passedLevels.includes(level) ? [...p.passedLevels, level].sort((a, b) => a - b) : p.passedLevels,
    unlockedLevel: passed ? Math.max(p.unlockedLevel, Math.min(MAX_LEVEL, level + 1)) : p.unlockedLevel,
  };
}
