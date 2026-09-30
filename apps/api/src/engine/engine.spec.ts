import { describe, expect, it } from 'vitest';
import { PERSONAS, SCENARIOS } from '@speakai/db/content';
import { prepareConversation, publicState } from './engine.js';
import { LIVE_CORRECTION, NO_CORRECTION } from './layers.js';
import { handleToolCall } from './tools.js';

const persona = { id: 'p1', version: 1, name: PERSONAS[0]!.name, promptFragment: PERSONAS[0]!.promptFragment };
const scenario = (slug: string) => {
  const s = SCENARIOS.find((x) => x.slug === slug)!;
  return { id: `sv-${slug}`, version: 1, ...s };
};
/** Deterministic rng cycling through the given values. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const base = { persona, difficulty: 'INTERMEDIATE' as const, liveCorrection: false, learnerGoals: [], timeZone: 'Asia/Kolkata' };

describe('seed content × engine', () => {
  // Every variant of every scenario must render with no missing {{placeholders}}.
  for (const s of SCENARIOS) {
    it(`renders every variant of ${s.slug}`, () => {
      const variants = Object.values(s.params).find(Array.isArray)!.length;
      for (let v = 0; v < variants; v++) {
        const rng = seq((v + 0.5) / variants, 0.1, 0.9);
        const prepared = prepareConversation({ ...base, scenario: scenario(s.slug), rng });
        expect(prepared.instructions).not.toMatch(/\{\{/);
        expect(prepared.brief.briefing).not.toMatch(/\{\{/);
        expect(prepared.openingCue).toMatch(/^\(Call system:/);
      }
    });
  }

  it('never shows hidden values (seller floor price) to the user', () => {
    const p = prepareConversation({ ...base, scenario: scenario('bargaining'), rng: seq(0) });
    const floorText = String(p.scenarioState.floorPriceText);
    expect(p.instructions).toContain(floorText); // the AI knows its minimum...
    const visible = JSON.stringify([p.brief, publicState(p.scenarioState, p.hiddenKeys)]);
    expect(visible).not.toContain(floorText); // ...the user never sees it
    expect(visible).not.toContain('floorPrice');
  });

  it('assigns opposite debate sides and tells the user theirs', () => {
    const p = prepareConversation({ ...base, scenario: scenario('debate'), rng: seq(0, 0.2) });
    expect(p.scenarioState.userSide).toBe('for');
    expect(p.scenarioState.aiSide).toBe('against');
    expect(p.brief.briefing).toContain('You argue for it');
  });

  it('avoids recently used casual situations', () => {
    const all = (SCENARIOS[0]!.params as { situations: string[] }).situations;
    const p = prepareConversation({ ...base, scenario: scenario('friendly-conversation'), recentSituations: all.slice(1) });
    expect(p.scenarioState.situation).toBe(all[0]);
  });

  it('switches correction layer, difficulty and turn-taking', () => {
    const off = prepareConversation({ ...base, scenario: scenario('job-interview') });
    const on = prepareConversation({ ...base, liveCorrection: true, difficulty: 'BEGINNER', scenario: scenario('job-interview') });
    expect(off.instructions).toContain(NO_CORRECTION);
    expect(on.instructions).toContain(LIVE_CORRECTION);
    expect(on.instructions).toContain('The user is a beginner');
    expect(on.turnTaking.silenceMs).toBeGreaterThan(off.turnTaking.silenceMs);
  });

  it('records prompt versions for reproducibility', () => {
    const p = prepareConversation({ ...base, scenario: scenario('client-meeting') });
    expect(p.promptVersions).toMatchObject({ core: expect.any(String), scenarioVersion: 1, personaVersion: 1 });
    expect(p.instructionsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('offers record_offer only in negotiations', () => {
    const names = (slug: string) => prepareConversation({ ...base, scenario: scenario(slug) }).tools.map((t) => t.name);
    expect(names('bargaining')).toContain('record_offer');
    expect(names('debate')).not.toContain('record_offer');
    expect(names('debate')).toEqual(['end_conversation']); // goals are judged after the call, not live
  });
});

describe('handleToolCall', () => {
  const ctx = {
    values: { askPrice: 2500, floorPrice: 1400 },
    goalIds: ['made_counter_offer', 'gave_reason'],
    goalsAchieved: new Set<string>(),
  };

  it('never lets the seller go below the floor price', () => {
    const ok = handleToolCall('record_offer', { price: 1800 }, ctx);
    expect(ok.stateChanges).toEqual({ currentOffer: 1800 });
    expect(ok.response.ok).toBe(true);

    const tooLow = handleToolCall('record_offer', { price: 900 }, ctx);
    expect(tooLow.stateChanges).toEqual({ currentOffer: 1400 });
    expect(tooLow.response).toMatchObject({ ok: false });
    expect(String(tooLow.response.error)).toContain('₹1,400');
  });

  it('validates goal ids and ignores duplicates', () => {
    expect(handleToolCall('mark_goal_achieved', { goal_id: 'gave_reason' }, ctx).goalAchieved).toBe('gave_reason');
    expect(handleToolCall('mark_goal_achieved', { goal_id: 'nope' }, ctx).response.ok).toBe(false);
    const done = { ...ctx, goalsAchieved: new Set(['gave_reason']) };
    expect(handleToolCall('mark_goal_achieved', { goal_id: 'gave_reason' }, done).goalAchieved).toBeUndefined();
  });

  it('maps end_conversation reasons and rejects unknown tools', () => {
    expect(handleToolCall('end_conversation', { reason: 'objective_completed' }, ctx).endRequested).toBe('OBJECTIVE_COMPLETED');
    expect(handleToolCall('end_conversation', {}, ctx).endRequested).toBe('AI_NATURAL_END');
    expect(handleToolCall('delete_database', {}, ctx).response.ok).toBe(false);
  });
});
