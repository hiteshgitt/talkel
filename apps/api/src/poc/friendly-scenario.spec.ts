import { describe, expect, it } from 'vitest';
import {
  buildGreetingCue,
  buildInstructions,
  buildSessionConfig,
  OPENING_SITUATIONS,
  OPENING_STYLES,
  pickOpening,
  POC_PERSONAS,
  WRAP_UP_NOTE,
} from './friendly-scenario.js';

describe('call openings', () => {
  it('describes the real local day and time (India) so the AI does not ask about "the weekend" midweek', () => {
    // 2026-09-30 is a Wednesday; 13:30 UTC = 19:00 IST.
    const opening = pickOpening(() => 0, new Date('2026-09-30T13:30:00Z'));
    expect(opening.when).toBe('Wednesday evening');
    expect(opening.situation).toBe(OPENING_SITUATIONS[0]);
    expect(opening.style).toBe(OPENING_STYLES[0]);
    expect(pickOpening(() => 0, new Date('2026-10-03T03:00:00Z')).when).toBe('Saturday morning');
  });

  it('never indexes out of range, even for rng() values at the top of the range', () => {
    const opening = pickOpening(() => 0.9999999);
    expect(OPENING_SITUATIONS).toContain(opening.situation);
    expect(OPENING_STYLES).toContain(opening.style);
  });

  it('avoids recently used situations', () => {
    const avoid = OPENING_SITUATIONS.slice(0, OPENING_SITUATIONS.length - 1);
    expect(pickOpening(Math.random, new Date(), { avoid }).situation).toBe(OPENING_SITUATIONS.at(-1));
    // If everything is "recent", still return something valid.
    expect(OPENING_SITUATIONS).toContain(pickOpening(Math.random, new Date(), { avoid: OPENING_SITUATIONS }).situation);
  });

  it('produces varied openings across calls', () => {
    const seen = new Set(Array.from({ length: 40 }, () => pickOpening().situation));
    expect(seen.size).toBeGreaterThan(8);
  });

  it('puts situation, style and time into the greeting cue', () => {
    const cue = buildGreetingCue({ situation: 'your cricket team won', style: 'ask for their advice', when: 'Friday night' });
    expect(cue).toContain('Friday night');
    expect(cue).toContain('your cricket team won');
    expect(cue).toContain('ask for their advice');
  });

  it('tells the AI to avoid stock openers', () => {
    const text = buildInstructions(POC_PERSONAS.female);
    expect(text).toContain("never open with stock lines");
    expect(text).not.toContain('("Hey! How\'s it going?")');
  });
});

describe('friendly scenario config', () => {
  it('binds model, voice, verbatim transcription and low-eagerness semantic VAD', () => {
    const cfg = buildSessionConfig({ model: 'm', transcribeModel: 't', persona: POC_PERSONAS.female });
    expect(cfg.model).toBe('m');
    expect(cfg.audio.output.voice).toBe('marin');
    expect(cfg.audio.input.transcription.model).toBe('t');
    expect(cfg.audio.input.transcription.prompt).toMatch(/verbatim/i);
    expect(cfg.audio.input.turn_detection).toMatchObject({ type: 'semantic_vad', eagerness: 'low', interrupt_response: true });
  });

  it('keeps the AI in character (no grammar correction) and includes the persona', () => {
    const text = buildInstructions(POC_PERSONAS.male);
    expect(text).toContain('Do not correct the user');
    expect(text).toContain('Rohan');
    expect(text).not.toContain(WRAP_UP_NOTE);
    expect(buildInstructions(POC_PERSONAS.male, WRAP_UP_NOTE)).toContain(WRAP_UP_NOTE);
  });
});
