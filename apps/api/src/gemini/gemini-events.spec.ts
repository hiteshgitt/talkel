import { describe, expect, it } from 'vitest';
import { normalizeGeminiMessage } from './gemini-events.js';

describe('normalizeGeminiMessage', () => {
  it('recognises setupComplete', () => {
    expect(normalizeGeminiMessage({ setupComplete: {} })).toEqual([{ type: 'setup_complete' }]);
  });

  it('splits one serverContent message into ordered events', () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const events = normalizeGeminiMessage({
      serverContent: {
        inputTranscription: { text: 'I am agree' },
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm.toString('base64') } }] },
        outputTranscription: { text: 'Oh really?' },
        turnComplete: true,
      },
    });
    expect(events.map((e) => e.type)).toEqual(['user.transcript', 'ai.audio', 'ai.transcript', 'turn_complete']);
    expect(events[1]).toEqual({ type: 'ai.audio', pcm24k: pcm });
  });

  it('drops transcription markers like <no speech detected>', () => {
    expect(normalizeGeminiMessage({ serverContent: { outputTranscription: { text: '<no speech detected>' } } })).toEqual([]);
    expect(normalizeGeminiMessage({ serverContent: { inputTranscription: { text: 'I think <noise> yes' } } })).toEqual([
      { type: 'user.transcript', text: 'I think  yes' },
    ]);
  });

  it('reports interruption', () => {
    expect(normalizeGeminiMessage({ serverContent: { interrupted: true } })).toEqual([{ type: 'interrupted' }]);
  });

  it('splits usage by modality', () => {
    const [e] = normalizeGeminiMessage({
      usageMetadata: {
        promptTokenCount: 1000,
        responseTokenCount: 300,
        promptTokensDetails: [
          { modality: 'TEXT', tokenCount: 800 },
          { modality: 'AUDIO', tokenCount: 200 },
        ],
        responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 300 }],
      },
    });
    expect(e).toEqual({
      type: 'usage',
      usage: { inputAudioTokens: 200, inputTextTokens: 800, cachedInputTokens: 0, outputAudioTokens: 300, outputTextTokens: 0 },
    });
  });

  it('parses tool calls', () => {
    expect(
      normalizeGeminiMessage({ toolCall: { functionCalls: [{ id: 'c1', name: 'record_offer', args: { price: 1800 } }] } }),
    ).toEqual([{ type: 'tool_call', calls: [{ id: 'c1', name: 'record_offer', args: { price: 1800 } }] }]);
  });

  it('ignores garbage and non-audio inline data', () => {
    expect(normalizeGeminiMessage('nope')).toEqual([]);
    expect(
      normalizeGeminiMessage({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'image/png', data: '' } }] } } }),
    ).toEqual([]);
  });
});
