import { describe, expect, it } from 'vitest';
import { applyAttempt, missionScore, objectivesOf } from './mission-rules.js';

describe('mission rules', () => {
  it('scores half communication, half objectives, in steps of 5', () => {
    expect(missionScore(80, 4, 5)).toBe(80); // (80 + 80) / 2
    expect(missionScore(70, 1, 4)).toBe(50); // (70 + 25) / 2 = 47.5 → 50
    expect(missionScore(60, 0, 0)).toBe(30);
  });

  it('unlocks the next level only when passed, never beyond 5', () => {
    const a = applyAttempt(null, 1, 55, false);
    expect(a).toEqual({ unlockedLevel: 1, passedLevels: [], bestScores: { '1': 55 }, attempts: 1 });
    const b = applyAttempt(a, 1, 80, true);
    expect(b).toEqual({ unlockedLevel: 2, passedLevels: [1], bestScores: { '1': 80 }, attempts: 2 });
    const c = applyAttempt(b, 1, 60, true); // replaying an easier level keeps the best score
    expect(c.bestScores['1']).toBe(80);
    expect(c.unlockedLevel).toBe(2);
    expect(applyAttempt({ ...c, unlockedLevel: 5 }, 5, 90, true).unlockedLevel).toBe(5);
  });

  it('uses the user-facing label for objectives', () => {
    expect(objectivesOf([{ id: 'a', description: 'The user did A', label: 'Do A' }, { id: 'b', description: 'The user did B' }])).toEqual([
      { id: 'a', text: 'Do A' },
      { id: 'b', text: 'The user did B' },
    ]);
  });
});
