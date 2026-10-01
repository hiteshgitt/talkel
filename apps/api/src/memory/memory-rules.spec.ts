import { describe, expect, it } from 'vitest';
import { MAX_MEMORIES, memoryApplies, planMemoryChanges } from './memory-rules.js';

describe('memory rules', () => {
  it('learns and uses memory only where the user speaks as themselves', () => {
    expect(memoryApplies({ kind: 'casual', missionLevel: null, isReplay: false })).toBe(true);
    expect(memoryApplies({ kind: 'interview', missionLevel: null, isReplay: false })).toBe(true);
    expect(memoryApplies({ kind: 'interview', missionLevel: 1, isReplay: false })).toBe(false); // a mission role
    expect(memoryApplies({ kind: 'roleplay', missionLevel: null, isReplay: false })).toBe(false);
    expect(memoryApplies({ kind: 'casual', missionLevel: null, isReplay: true })).toBe(false);
  });

  it('updates referenced items, skips duplicates, and caps the list', () => {
    const existing = [
      { id: 'a', kind: 'WORK', text: 'Works as a developer' },
      { id: 'b', kind: 'UPCOMING', text: 'Has an interview next week' },
    ];
    expect(
      planMemoryChanges(existing, [
        { ref: 'm2', kind: 'UPCOMING', text: 'Had the Infosys interview on 30 Sep; waiting for the result' },
        { ref: null, kind: 'WORK', text: 'works as a developer.' }, // duplicate
        { ref: 'm9', kind: 'INTERESTS', text: 'Loves trekking' }, // unknown ref → added
      ]),
    ).toEqual([
      { update: { id: 'b', kind: 'UPCOMING', text: 'Had the Infosys interview on 30 Sep; waiting for the result' } },
      { create: { kind: 'INTERESTS', text: 'Loves trekking' } },
    ]);
    const full = Array.from({ length: MAX_MEMORIES }, (_, i) => ({ id: String(i), kind: 'ABOUT', text: `fact ${i}` }));
    expect(planMemoryChanges(full, [{ ref: null, kind: 'ABOUT', text: 'one more' }])).toEqual([]);
  });
});
