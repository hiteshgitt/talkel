import { describe, expect, it } from 'vitest';
import { buildInstructions, buildSessionConfig, POC_PERSONAS, WRAP_UP_NOTE } from './friendly-scenario.js';

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
