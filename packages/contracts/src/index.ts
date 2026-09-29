/**
 * API contracts shared by apps/api and apps/mobile.
 * Zod schemas are the single source of truth; TS types are inferred from them.
 *
 * Kept as a single module on purpose: Metro (mobile) and Node ESM (api) both
 * consume the compiled dist/ output, so there are no relative-import extension
 * differences to manage.
 */
import { z } from 'zod';

// ───────────── Common ─────────────

export const ProblemDetails = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;

export const VoiceChoice = z.enum(['female', 'male']);
export type VoiceChoice = z.infer<typeof VoiceChoice>;

export const Speaker = z.enum(['USER', 'AI']);
export type Speaker = z.infer<typeof Speaker>;

// ───────────── Milestone 0: voice POC ─────────────
// Minimal surface to prove the realtime loop. Replaced by /v1/conversations in M2.

export const PocConnectRequest = z.object({
  /** SDP offer produced by the device's RTCPeerConnection. */
  sdpOffer: z.string().min(1).max(20_000),
  voice: VoiceChoice,
});
export type PocConnectRequest = z.infer<typeof PocConnectRequest>;

export const PocConnectResponse = z.object({
  callId: z.string(),
  sdpAnswer: z.string(),
  maxDurationSec: z.number().int().positive(),
});
export type PocConnectResponse = z.infer<typeof PocConnectResponse>;

export const PocCallStatus = z.enum(['CONNECTING', 'ACTIVE', 'ENDED', 'FAILED']);
export type PocCallStatus = z.infer<typeof PocCallStatus>;

export const PocEndReason = z.enum(['USER_ENDED', 'TIME_LIMIT', 'PROVIDER_CLOSED', 'CONNECTION_LOST', 'ERROR']);
export type PocEndReason = z.infer<typeof PocEndReason>;

export const TranscriptTurn = z.object({
  seq: z.number().int().nonnegative(),
  speaker: Speaker,
  text: z.string(),
  /** Offset from call start in ms. */
  startMs: z.number().int().nonnegative(),
  /** True when the AI was cut off by the user (barge-in). */
  interrupted: z.boolean(),
  /** False while a user turn's transcription is still pending. */
  final: z.boolean(),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurn>;

export const PocTranscriptResponse = z.object({
  callId: z.string(),
  status: PocCallStatus,
  endReason: PocEndReason.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  turns: z.array(TranscriptTurn),
});
export type PocTranscriptResponse = z.infer<typeof PocTranscriptResponse>;
