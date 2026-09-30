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

// ───────────── Users, profile, onboarding (M1) ─────────────

export const EnglishLevel = z.enum(['BEGINNER', 'INTERMEDIATE', 'UPPER_INTERMEDIATE', 'ADVANCED', 'EXPERT']);
export type EnglishLevel = z.infer<typeof EnglishLevel>;

export const LearningGoal = z.enum([
  'daily_conversation',
  'job_interviews',
  'work_meetings',
  'client_calls',
  'presentations',
  'travel',
  'exams_migration',
  'confidence',
]);
export type LearningGoal = z.infer<typeof LearningGoal>;

/** Language for feedback explanations. Conversations themselves are always in English. */
export const FeedbackLanguage = z.enum(['en', 'hi']);
export type FeedbackLanguage = z.infer<typeof FeedbackLanguage>;

export const VoiceGender = z.enum(['FEMALE', 'MALE', 'NEUTRAL']);
export type VoiceGender = z.infer<typeof VoiceGender>;

/** Bump when the privacy/consent notice text changes; users are asked to agree again. */
export const CONSENT_VERSION = '2026-09-30';

export const UserRole = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const Me = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    role: UserRole,
  }),
  profile: z.object({
    displayName: z.string().nullable(),
    nativeLanguage: z.string().nullable(),
    selfReportedLevel: EnglishLevel.nullable(),
    goals: z.array(LearningGoal),
    timezone: z.string(),
    onboardedAt: z.string().nullable(),
    consentVersion: z.string().nullable(),
  }),
  settings: z.object({
    feedbackLanguage: FeedbackLanguage,
    liveCorrection: z.boolean(),
    defaultDifficulty: EnglishLevel,
    defaultDurationSec: z.number().int(),
    preferredVoiceGender: VoiceGender.nullable(),
    notificationsEnabled: z.boolean(),
  }),
  /** True once onboarding is complete and the current consent notice was accepted. */
  onboarded: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const OnboardingRequest = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  level: EnglishLevel,
  goals: z.array(LearningGoal).min(1).max(8),
  feedbackLanguage: FeedbackLanguage,
  nativeLanguage: z.string().trim().min(2).max(10).optional(),
  /** Must be the literal current version: proves the user saw this notice. */
  consentVersion: z.literal(CONSENT_VERSION),
});
export type OnboardingRequest = z.infer<typeof OnboardingRequest>;

export const ProfilePatch = z
  .object({
    displayName: z.string().trim().min(1).max(60).nullable(),
    nativeLanguage: z.string().trim().min(2).max(10).nullable(),
    selfReportedLevel: EnglishLevel,
    goals: z.array(LearningGoal).min(1).max(8),
    timezone: z.string().min(1).max(64),
  })
  .partial()
  .strict();
export type ProfilePatch = z.infer<typeof ProfilePatch>;

export const SettingsPatch = z
  .object({
    feedbackLanguage: FeedbackLanguage,
    liveCorrection: z.boolean(),
    defaultDifficulty: EnglishLevel,
    defaultDurationSec: z.number().int().min(120).max(1800),
    preferredVoiceGender: VoiceGender.nullable(),
    notificationsEnabled: z.boolean(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

/** Public: which sign-in methods the server has enabled (e.g. Google only when configured). */
export const AuthConfig = z.object({
  emailPassword: z.boolean(),
  google: z.boolean(),
});
export type AuthConfig = z.infer<typeof AuthConfig>;

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
