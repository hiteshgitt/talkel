import { describe, expect, it } from 'vitest';
import { normalizeRealtimeEvent } from './realtime-events.js';

describe('normalizeRealtimeEvent', () => {
  it('maps user transcription completion', () => {
    expect(
      normalizeRealtimeEvent({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'item_1',
        content_index: 0,
        transcript: '  um I am agree  ',
      }),
    ).toEqual({ type: 'user.transcript', itemId: 'item_1', text: 'um I am agree' });
  });

  it('only treats assistant message items as AI turns', () => {
    expect(
      normalizeRealtimeEvent({
        type: 'response.output_item.added',
        response_id: 'r1',
        item: { id: 'i1', type: 'message', role: 'assistant' },
      }),
    ).toEqual({ type: 'ai.item_added', itemId: 'i1', responseId: 'r1' });

    expect(
      normalizeRealtimeEvent({
        type: 'response.output_item.added',
        response_id: 'r1',
        item: { id: 'i2', type: 'function_call' },
      }),
    ).toBeNull();
  });

  it('extracts usage from response.done', () => {
    expect(
      normalizeRealtimeEvent({
        type: 'response.done',
        response: {
          id: 'r1',
          status: 'completed',
          usage: {
            input_token_details: { text_tokens: 900, audio_tokens: 120, cached_tokens: 800 },
            output_token_details: { text_tokens: 30, audio_tokens: 210 },
          },
        },
      }),
    ).toEqual({
      type: 'ai.response_done',
      responseId: 'r1',
      status: 'completed',
      usage: { inputTextTokens: 900, inputAudioTokens: 120, cachedInputTokens: 800, outputTextTokens: 30, outputAudioTokens: 210 },
    });
  });

  it('returns null for unknown or malformed events instead of throwing', () => {
    expect(normalizeRealtimeEvent({ type: 'rate_limits.updated' })).toBeNull();
    expect(normalizeRealtimeEvent({ type: 'input_audio_buffer.speech_started' })).toBeNull();
    expect(normalizeRealtimeEvent('garbage')).toBeNull();
    expect(normalizeRealtimeEvent(null)).toBeNull();
  });

  it('maps provider errors', () => {
    expect(
      normalizeRealtimeEvent({ type: 'error', error: { type: 'invalid_request_error', code: null, message: 'bad' } }),
    ).toEqual({ type: 'error', code: 'invalid_request_error', message: 'bad' });
  });
});
