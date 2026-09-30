/**
 * Normalises Gemini Live (BidiGenerateContent) server messages into a flat list of events.
 * One server message can carry several things at once (audio + transcript + turnComplete),
 * so this returns an array. Unknown/malformed input yields [] and is only logged.
 */
import { z } from 'zod';
import type { RealtimeUsage } from '../realtime/realtime-events.js';

export type GeminiEvent =
  | { type: 'setup_complete' }
  | { type: 'ai.audio'; pcm24k: Buffer }
  | { type: 'ai.transcript'; text: string }
  | { type: 'user.transcript'; text: string }
  | { type: 'interrupted' }
  | { type: 'turn_complete' }
  | { type: 'usage'; usage: RealtimeUsage }
  | { type: 'go_away'; timeLeft: string | null }
  | { type: 'tool_call'; calls: Array<{ id: string; name: string; args: unknown }> };

const ModalityCount = z.object({ modality: z.string().optional(), tokenCount: z.number().optional() });

const ServerMessage = z.object({
  setupComplete: z.object({}).passthrough().optional(),
  serverContent: z
    .object({
      modelTurn: z
        .object({
          parts: z
            .array(
              z.object({
                inlineData: z.object({ mimeType: z.string().optional(), data: z.string() }).optional(),
                text: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
      inputTranscription: z.object({ text: z.string().optional() }).optional(),
      outputTranscription: z.object({ text: z.string().optional() }).optional(),
      interrupted: z.boolean().optional(),
      turnComplete: z.boolean().optional(),
    })
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      responseTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
      promptTokensDetails: z.array(ModalityCount).optional(),
      responseTokensDetails: z.array(ModalityCount).optional(),
    })
    .optional(),
  goAway: z.object({ timeLeft: z.string().optional() }).optional(),
  toolCall: z
    .object({
      functionCalls: z.array(z.object({ id: z.string(), name: z.string(), args: z.unknown().optional() })).optional(),
    })
    .optional(),
});

/** Transcription placeholders such as "<no speech detected>" or "<noise>" are markers, not speech. */
function cleanTranscript(text: string | undefined): string {
  return (text ?? '').replace(/<[^<>]{1,40}>/g, '');
}

export function normalizeGeminiMessage(raw: unknown): GeminiEvent[] {
  const parsed = ServerMessage.safeParse(raw);
  if (!parsed.success) return [];
  const m = parsed.data;
  const out: GeminiEvent[] = [];

  if (m.setupComplete) out.push({ type: 'setup_complete' });

  const sc = m.serverContent;
  if (sc) {
    // Input transcription first: it describes speech that happened before this model output.
    const userText = cleanTranscript(sc.inputTranscription?.text);
    if (userText.trim()) out.push({ type: 'user.transcript', text: userText });
    for (const part of sc.modelTurn?.parts ?? []) {
      const d = part.inlineData;
      if (d && (d.mimeType ?? '').startsWith('audio/pcm')) {
        out.push({ type: 'ai.audio', pcm24k: Buffer.from(d.data, 'base64') });
      }
    }
    const aiText = cleanTranscript(sc.outputTranscription?.text);
    if (aiText.trim()) out.push({ type: 'ai.transcript', text: aiText });
    if (sc.interrupted) out.push({ type: 'interrupted' });
    if (sc.turnComplete) out.push({ type: 'turn_complete' });
  }

  if (m.usageMetadata) out.push({ type: 'usage', usage: toUsage(m.usageMetadata) });
  if (m.goAway) out.push({ type: 'go_away', timeLeft: m.goAway.timeLeft ?? null });
  const calls = m.toolCall?.functionCalls ?? [];
  if (calls.length > 0) out.push({ type: 'tool_call', calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args ?? {} })) });
  return out;
}

function toUsage(u: NonNullable<z.infer<typeof ServerMessage>['usageMetadata']>): RealtimeUsage {
  const byModality = (details: Array<z.infer<typeof ModalityCount>> | undefined, modality: string) =>
    (details ?? []).filter((d) => d.modality === modality).reduce((n, d) => n + (d.tokenCount ?? 0), 0);

  const inAudio = byModality(u.promptTokensDetails, 'AUDIO');
  const outAudio = byModality(u.responseTokensDetails, 'AUDIO');
  return {
    inputAudioTokens: inAudio,
    inputTextTokens: Math.max(0, (u.promptTokenCount ?? 0) - inAudio),
    cachedInputTokens: u.cachedContentTokenCount ?? 0,
    outputAudioTokens: outAudio,
    outputTextTokens: Math.max(0, (u.responseTokenCount ?? 0) - outAudio),
  };
}
