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
export const CONSENT_VERSION = '2026-10-01';

export const Plan = z.enum(['FREE', 'PRO']);
export type Plan = z.infer<typeof Plan>;

/** Best-effort accent for the AI voice (never scored — PRD §16). */
export const Accent = z.enum(['AMERICAN', 'BRITISH', 'INDIAN', 'AUSTRALIAN']);
export type Accent = z.infer<typeof Accent>;

export const VoicePreference = z.enum(['FEMALE', 'MALE', 'RANDOM']);
export type VoicePreference = z.infer<typeof VoicePreference>;

export const UserRole = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof UserRole>;

export const Me = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    role: UserRole,
    plan: Plan,
  }),
  /** What the plan allows. Free: the partner's voice and accent are chosen at random. */
  entitlements: z.object({ choosePartner: z.boolean(), chooseAccent: z.boolean() }),
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
  /** True once onboarding (level, goals, language) is complete. */
  onboarded: z.boolean(),
  /** True when the user must (re-)accept the current privacy notice before using the app. */
  consentRequired: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const ConsentRequest = z.object({ consentVersion: z.literal(CONSENT_VERSION) });
export type ConsentRequest = z.infer<typeof ConsentRequest>;

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

// ───────────── Scenarios & personas (M2) ─────────────

export const ScenarioSummary = z.object({
  id: z.string(),
  slug: z.string(),
  category: z.object({ slug: z.string(), name: z.string() }),
  title: z.string(),
  tagline: z.string(),
  minLevel: EnglishLevel,
  estimatedMinutes: z.number().int(),
});
export type ScenarioSummary = z.infer<typeof ScenarioSummary>;

export const PersonaSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  gender: VoiceGender,
  description: z.string(),
});
export type PersonaSummary = z.infer<typeof PersonaSummary>;

export const Catalog = z.object({ scenarios: z.array(ScenarioSummary), personas: z.array(PersonaSummary) });
export type Catalog = z.infer<typeof Catalog>;

// ───────────── Conversations (M2) ─────────────

export const DURATION_OPTIONS_SEC = [180, 300, 600] as const;

export const Quota = z.object({
  dailyLimitSec: z.number().int(),
  usedTodaySec: z.number().int(),
  remainingSec: z.number().int(),
  /** ISO timestamp of the next reset (midnight in the user's time zone). */
  resetsAt: z.string(),
});
export type Quota = z.infer<typeof Quota>;

export const CreateConversationRequest = z.object({
  scenarioId: z.string().uuid(),
  /** A specific partner (Pro). Otherwise one is picked at random, filtered by `voice`. */
  personaId: z.string().uuid().optional(),
  voice: VoicePreference.optional(),
  /** A specific accent (Pro), or random. */
  accent: z.union([Accent, z.literal('RANDOM')]).optional(),
  difficulty: EnglishLevel.optional(),
  durationSec: z.number().int().min(60).max(1800).optional(),
  liveCorrection: z.boolean().optional(),
});
export type CreateConversationRequest = z.infer<typeof CreateConversationRequest>;

export const ConversationBrief = z.object({
  title: z.string(),
  briefing: z.string(),
  userRole: z.string(),
  objective: z.string(),
});
export type ConversationBrief = z.infer<typeof ConversationBrief>;

export const SessionStatus = z.enum(['CREATED', 'CONNECTING', 'ACTIVE', 'RECONNECTING', 'ENDED', 'FAILED', 'EXPIRED']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const EndReason = z.enum([
  'USER_ENDED',
  'TIME_LIMIT',
  'OBJECTIVE_COMPLETED',
  'AI_NATURAL_END',
  'CONNECTION_LOST',
  'PROVIDER_CLOSED',
  'QUOTA_EXHAUSTED',
  'SERVER_RESTART',
  'ERROR',
]);
export type EndReason = z.infer<typeof EndReason>;

export const CreateConversationResponse = z.object({
  id: z.string(),
  brief: ConversationBrief,
  persona: PersonaSummary,
  accent: Accent,
  difficulty: EnglishLevel,
  /** Planned length, already capped by the remaining daily allowance. */
  durationSec: z.number().int(),
});
export type CreateConversationResponse = z.infer<typeof CreateConversationResponse>;

export const ConnectRequest = z.object({
  sdpOffer: z.string().min(1).max(20_000),
  /** True when re-joining the same conversation after a network drop. */
  reconnect: z.boolean().optional(),
});
export type ConnectRequest = z.infer<typeof ConnectRequest>;

export const ConnectResponse = z.object({ sdpAnswer: z.string(), durationSec: z.number().int() });
export type ConnectResponse = z.infer<typeof ConnectResponse>;

export const ConversationSummary = z.object({
  id: z.string(),
  scenarioTitle: z.string(),
  personaName: z.string(),
  difficulty: EnglishLevel,
  status: SessionStatus,
  endReason: EndReason.nullable(),
  createdAt: z.string(),
  durationMs: z.number().int().nullable(),
  turnCount: z.number().int(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationList = z.object({ items: z.array(ConversationSummary), nextCursor: z.string().nullable() });
export type ConversationList = z.infer<typeof ConversationList>;

// ───────────── Transcript ─────────────

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

// ───────────── Conversation detail ─────────────

export const RecordingInfo = z.object({
  /** True while the call is still recording or being finalised. */
  inProgress: z.boolean(),
  durationMs: z.number().int().nullable(),
  bytes: z.number().int().nullable(),
});
export type RecordingInfo = z.infer<typeof RecordingInfo>;

export const ConversationDetail = ConversationSummary.extend({
  accent: Accent,
  recording: RecordingInfo.nullable(),
  brief: ConversationBrief,
  goals: z.array(z.object({ id: z.string(), description: z.string(), achieved: z.boolean() })),
  turns: z.array(TranscriptTurn),
});
export type ConversationDetail = z.infer<typeof ConversationDetail>;
