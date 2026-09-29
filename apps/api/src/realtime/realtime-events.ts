/**
 * Normalises raw OpenAI Realtime server events into the small, provider-agnostic
 * event vocabulary the rest of the backend uses (see docs/AI-ARCHITECTURE.md §2).
 *
 * Provider payloads are validated with Zod; anything unknown or malformed yields
 * `null` (it is still written to the raw call log, just not acted upon).
 */
import { z } from 'zod';

export type RealtimeEvent =
  | { type: 'session.ready' }
  | { type: 'user.speech_started'; itemId: string }
  | { type: 'user.speech_stopped'; itemId: string }
  | { type: 'user.transcript'; itemId: string; text: string }
  | { type: 'user.transcript_failed'; itemId: string; message: string }
  | { type: 'ai.item_added'; itemId: string; responseId: string }
  | { type: 'ai.transcript_delta'; itemId: string; delta: string }
  | { type: 'ai.transcript_done'; itemId: string; text: string }
  | { type: 'ai.audio_started'; responseId: string | null }
  | { type: 'ai.audio_stopped'; responseId: string | null }
  | { type: 'ai.item_truncated'; itemId: string }
  | { type: 'ai.response_done'; responseId: string; status: string; usage: RealtimeUsage | null }
  | { type: 'error'; code: string; message: string };

export interface RealtimeUsage {
  inputTextTokens: number;
  inputAudioTokens: number;
  cachedInputTokens: number;
  outputTextTokens: number;
  outputAudioTokens: number;
}

const str = z.string();
const Base = z.object({ type: str });

const UsageSchema = z
  .object({
    input_token_details: z
      .object({
        text_tokens: z.number().optional(),
        audio_tokens: z.number().optional(),
        cached_tokens: z.number().optional(),
      })
      .partial()
      .optional(),
    output_token_details: z
      .object({ text_tokens: z.number().optional(), audio_tokens: z.number().optional() })
      .partial()
      .optional(),
  })
  .nullish();

const schemas = {
  'session.created': Base,
  'input_audio_buffer.speech_started': Base.extend({ item_id: str }),
  'input_audio_buffer.speech_stopped': Base.extend({ item_id: str }),
  'conversation.item.input_audio_transcription.completed': Base.extend({ item_id: str, transcript: str }),
  'conversation.item.input_audio_transcription.failed': Base.extend({
    item_id: str,
    error: z.object({ message: str.optional() }).optional(),
  }),
  'response.output_item.added': Base.extend({
    response_id: str,
    item: z.object({ id: str, type: str, role: str.optional() }),
  }),
  'response.output_audio_transcript.delta': Base.extend({ item_id: str, delta: str }),
  'response.output_audio_transcript.done': Base.extend({ item_id: str, transcript: str }),
  'output_audio_buffer.started': Base.extend({ response_id: str.optional() }),
  'output_audio_buffer.stopped': Base.extend({ response_id: str.optional() }),
  'conversation.item.truncated': Base.extend({ item_id: str }),
  'response.done': Base.extend({
    response: z.object({ id: str, status: str, usage: UsageSchema }),
  }),
  error: Base.extend({
    error: z.object({ code: str.nullish(), type: str.nullish(), message: str.nullish() }),
  }),
} as const;

type KnownType = keyof typeof schemas;

function isKnown(type: string): type is KnownType {
  return Object.hasOwn(schemas, type);
}

export function normalizeRealtimeEvent(raw: unknown): RealtimeEvent | null {
  const base = Base.safeParse(raw);
  if (!base.success || !isKnown(base.data.type)) return null;

  const type = base.data.type;
  const parsed = schemas[type].safeParse(raw);
  if (!parsed.success) return null;
  // Narrowing on `type` below re-validates shape via the specific schema (cheap, and keeps TS honest).
  const e = parsed.data as Record<string, unknown>;

  switch (type) {
    case 'session.created':
      return { type: 'session.ready' };
    case 'input_audio_buffer.speech_started':
      return { type: 'user.speech_started', itemId: e.item_id as string };
    case 'input_audio_buffer.speech_stopped':
      return { type: 'user.speech_stopped', itemId: e.item_id as string };
    case 'conversation.item.input_audio_transcription.completed':
      return { type: 'user.transcript', itemId: e.item_id as string, text: (e.transcript as string).trim() };
    case 'conversation.item.input_audio_transcription.failed': {
      const err = e.error as { message?: string } | undefined;
      return { type: 'user.transcript_failed', itemId: e.item_id as string, message: err?.message ?? 'unknown' };
    }
    case 'response.output_item.added': {
      const item = e.item as { id: string; type: string; role?: string };
      if (item.type !== 'message' || item.role !== 'assistant') return null; // function calls handled in M2
      return { type: 'ai.item_added', itemId: item.id, responseId: e.response_id as string };
    }
    case 'response.output_audio_transcript.delta':
      return { type: 'ai.transcript_delta', itemId: e.item_id as string, delta: e.delta as string };
    case 'response.output_audio_transcript.done':
      return { type: 'ai.transcript_done', itemId: e.item_id as string, text: (e.transcript as string).trim() };
    case 'output_audio_buffer.started':
      return { type: 'ai.audio_started', responseId: (e.response_id as string | undefined) ?? null };
    case 'output_audio_buffer.stopped':
      return { type: 'ai.audio_stopped', responseId: (e.response_id as string | undefined) ?? null };
    case 'conversation.item.truncated':
      return { type: 'ai.item_truncated', itemId: e.item_id as string };
    case 'response.done': {
      const r = e.response as { id: string; status: string; usage: z.infer<typeof UsageSchema> };
      return { type: 'ai.response_done', responseId: r.id, status: r.status, usage: toUsage(r.usage) };
    }
    case 'error': {
      const err = e.error as { code?: string | null; type?: string | null; message?: string | null };
      return { type: 'error', code: err.code ?? err.type ?? 'unknown', message: err.message ?? '' };
    }
  }
}

function toUsage(u: z.infer<typeof UsageSchema>): RealtimeUsage | null {
  if (!u) return null;
  return {
    inputTextTokens: u.input_token_details?.text_tokens ?? 0,
    inputAudioTokens: u.input_token_details?.audio_tokens ?? 0,
    cachedInputTokens: u.input_token_details?.cached_tokens ?? 0,
    outputTextTokens: u.output_token_details?.text_tokens ?? 0,
    outputAudioTokens: u.output_token_details?.audio_tokens ?? 0,
  };
}
