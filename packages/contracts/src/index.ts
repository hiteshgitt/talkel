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
    /** False for accounts that only sign in with Google (account deletion then needs a recent sign-in). */
    hasPassword: z.boolean(),
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
    /** Personal memory (opt-in). */
    memoryEnabled: z.boolean(),
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
    /** Turning memory off deletes everything remembered. */
    memoryEnabled: z.boolean(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

// ───────────── Personal memory ─────────────

export const MemoryKind = z.enum(['ABOUT', 'WORK', 'INTERESTS', 'UPCOMING', 'GOALS']);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryItem = z.object({ id: z.string(), kind: MemoryKind, text: z.string(), createdAt: z.string(), updatedAt: z.string() });
export type MemoryItem = z.infer<typeof MemoryItem>;

export const MemoryList = z.object({ enabled: z.boolean(), items: z.array(MemoryItem) });
export type MemoryList = z.infer<typeof MemoryList>;

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

// ───────────── Missions (M4) ─────────────

/** Pressure levels, independent of English level. Passing level N unlocks N+1. */
export const MISSION_LEVELS = [
  { level: 1, name: 'Comfortable' },
  { level: 2, name: 'Natural' },
  { level: 3, name: 'Challenging' },
  { level: 4, name: 'Pressure' },
  { level: 5, name: 'Real world' },
] as const;
export const MissionLevel = z.number().int().min(1).max(5);

export const MissionSkill = z.enum(['persuasion', 'assertiveness', 'professionalism', 'empathy', 'structure', 'composure', 'politeness']);
export type MissionSkill = z.infer<typeof MissionSkill>;
export const MissionGroup = z.enum(['career', 'everyday', 'challenge']);
export type MissionGroup = z.infer<typeof MissionGroup>;

export const MissionSummary = z.object({
  id: z.string(),
  slug: z.string(),
  group: MissionGroup,
  title: z.string(),
  tagline: z.string(),
  minLevel: EnglishLevel,
  estimatedMinutes: z.number().int(),
  aiCharacter: z.string(),
  /** What the user must achieve (user-facing wording). */
  objectives: z.array(z.string()),
  skills: z.array(MissionSkill),
  progress: z.object({
    unlockedLevel: MissionLevel,
    passedLevels: z.array(MissionLevel),
    /** Best mission score per level, e.g. { "1": 85 } */
    bestScores: z.record(z.string(), z.number().int()),
    attempts: z.number().int(),
  }),
});
export type MissionSummary = z.infer<typeof MissionSummary>;

export const MissionList = z.object({ missions: z.array(MissionSummary) });
export type MissionList = z.infer<typeof MissionList>;

/** The mission part of a conversation's feedback. */
export const MissionResult = z.object({
  level: MissionLevel,
  result: z.enum(['SUCCESS', 'PARTIAL', 'FAILED']),
  /** One line, e.g. "Raise agreed at 10% (first offer 7%)". */
  headline: z.string(),
  reason: z.string(),
  objectivesAchieved: z.number().int(),
  objectivesTotal: z.number().int(),
  /** 0–100 in steps of 5: half communication (overall score), half objectives achieved. */
  missionScore: z.number().int(),
  passed: z.boolean(),
  skills: z.array(z.object({ key: MissionSkill, band: z.number().int(), score: z.number().int(), rationale: z.string() })),
});
export type MissionResult = z.infer<typeof MissionResult>;

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
  /** Missions only: the pressure level to play (must be unlocked; defaults to the highest unlocked). */
  missionLevel: MissionLevel.optional(),
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
  scenarioSlug: z.string(),
  brief: ConversationBrief,
  persona: PersonaSummary,
  accent: Accent,
  difficulty: EnglishLevel,
  /** Planned length, already capped by the remaining daily allowance. */
  durationSec: z.number().int(),
  mission: z.object({ level: MissionLevel, objectives: z.array(z.string()), aiCharacter: z.string() }).nullable(),
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
  scenarioSlug: z.string(),
  personaName: z.string(),
  difficulty: EnglishLevel,
  status: SessionStatus,
  endReason: EndReason.nullable(),
  createdAt: z.string(),
  durationMs: z.number().int().nullable(),
  turnCount: z.number().int(),
  /** From the after-call feedback; null until (or unless) it is ready. */
  overallScore: z.number().int().nullable(),
  /** Missions: the level played; null for practice. */
  missionLevel: MissionLevel.nullable(),
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

// ───────────── After-call feedback (M3) ─────────────

export const AnalysisStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED']);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const SkillKey = z.enum(['grammar', 'vocabulary', 'fluency', 'conversation', 'clarity']);
export type SkillKey = z.infer<typeof SkillKey>;

export const SkillAssessment = z.object({
  /** 1 (needs a lot of work) … 5 (excellent for everyday use) */
  band: z.number().int().min(1).max(5),
  /** Band shown as 0–100 in steps of 5 — the rationale is what matters (PRD §28). */
  score: z.number().int().min(0).max(100),
  rationale: z.string(),
});
export type SkillAssessment = z.infer<typeof SkillAssessment>;

export const GrammarCategory = z.enum([
  'VERB_TENSE',
  'SUBJECT_VERB_AGREEMENT',
  'ARTICLES',
  'PREPOSITIONS',
  'WORD_ORDER',
  'PLURALS',
  'PRONOUNS',
  'QUESTION_FORM',
  'VERB_FORM',
  'WORD_CHOICE',
  'OTHER',
]);
export type GrammarCategory = z.infer<typeof GrammarCategory>;

/** What went wrong in a conversation moment. */
export const MomentKind = z.enum(['TOO_SHORT', 'MISSED_QUESTION', 'NO_FOLLOW_UP', 'OFF_TOPIC', 'ABRUPT_TONE', 'UNCLEAR']);
export type MomentKind = z.infer<typeof MomentKind>;

export const Feedback = z.object({
  overallScore: z.number().int().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  focusAreas: z.array(z.string()),
  skills: z.record(SkillKey, SkillAssessment),
  grammarErrors: z.array(
    z.object({
      turnSeq: z.number().int(),
      original: z.string(),
      corrected: z.string(),
      category: GrammarCategory,
      explanation: z.string(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    }),
  ),
  vocabulary: z.array(
    z.object({
      kind: z.enum(['REPEATED', 'UPGRADE', 'GOOD_USAGE']),
      term: z.string(),
      alternatives: z.array(z.string()),
      example: z.string().nullable(),
    }),
  ),
  fluency: z.object({
    userSpeakingMs: z.number().int(),
    userWords: z.number().int(),
    wordsPerMinute: z.number().int().nullable(),
    fillerCounts: z.record(z.string(), z.number().int()),
    fillersPerMinute: z.number().nullable(),
    latencyP50Ms: z.number().int().nullable(),
    longPauseCount: z.number().int(),
  }),
  conversationSkills: z.object({
    askedQuestions: z.boolean(),
    elaborated: z.boolean(),
    disagreedPolitely: z.boolean().nullable(),
    clarified: z.boolean().nullable(),
    notes: z.string(),
  }),
  translationPatterns: z.array(z.string()),
  /** Correct but unnatural sentences, with a more natural way to say them. */
  phrasing: z.array(z.object({ turnSeq: z.number().int(), original: z.string(), better: z.string(), why: z.string() })),
  /** Replies the learner could have handled better, with an example of a better reply. */
  conversationMoments: z.array(
    z.object({ turnSeq: z.number().int(), kind: MomentKind, youSaid: z.string(), better: z.string(), why: z.string() }),
  ),
  recommendations: z.array(z.object({ type: z.string(), scenarioSlug: z.string().nullable(), title: z.string(), reason: z.string() })),
  /** Missions only. */
  mission: MissionResult.nullable(),
  /** Personal memory: what Talkel remembered from this conversation (empty when memory is off). */
  remembered: z.array(z.string()),
  feedbackLanguage: FeedbackLanguage,
});
export type Feedback = z.infer<typeof Feedback>;

const SkillScores = z.object({
  grammar: z.number().int().nullable(),
  vocabulary: z.number().int().nullable(),
  fluency: z.number().int().nullable(),
  conversation: z.number().int().nullable(),
  clarity: z.number().int().nullable(),
});

/** Direction of a measure between earlier and recent conversations; null when there is too little data. */
export const Trend = z.enum(['BETTER', 'WORSE', 'STEADY']);
export type Trend = z.infer<typeof Trend>;

/**
 * Observable signals of speaking confidence (PRD §28: explainable, no "your confidence is 74%").
 * Values are averages over the recent conversations and the ones before them.
 */
export const ConfidenceKey = z.enum(['RESPONSE_SPEED', 'ANSWER_LENGTH', 'LONG_PAUSES', 'FILLERS', 'ASKING_QUESTIONS']);
export type ConfidenceKey = z.infer<typeof ConfidenceKey>;
export const ConfidenceIndicator = z.object({
  key: ConfidenceKey,
  /** RESPONSE_SPEED: seconds · ANSWER_LENGTH: words per answer · LONG_PAUSES / FILLERS: per minute · ASKING_QUESTIONS: share of calls 0–1 */
  recent: z.number().nullable(),
  earlier: z.number().nullable(),
  trend: Trend.nullable(),
});
export type ConfidenceIndicator = z.infer<typeof ConfidenceIndicator>;

export const Progress = z.object({
  analysedConversations: z.number().int(),
  totalSpeakingMs: z.number().int(),
  /** Smoothed skill scores (0–100), recent conversations weighted more; null until the first feedback. */
  skills: SkillScores,
  streak: z.object({ current: z.number().int(), longest: z.number().int(), practisedToday: z.boolean() }),
  /** Seconds spoken per local day, oldest first (the last 28 days, ending today). */
  calendar: z.array(z.object({ date: z.string(), seconds: z.number().int() })),
  /** Per analysed conversation, oldest first (the most recent 20). */
  history: z.array(
    z.object({
      conversationId: z.string(),
      createdAt: z.string(),
      scenarioTitle: z.string(),
      overall: z.number().int(),
      skills: SkillScores,
      wordsPerMinute: z.number().int().nullable(),
      mistakes: z.number().int(),
    }),
  ),
  confidence: z.array(ConfidenceIndicator),
  /** Trend: BETTER = fewer per conversation recently than before. */
  commonMistakes: z.array(z.object({ category: GrammarCategory, count: z.number().int(), trend: Trend.nullable() })),
  commonFillers: z.array(z.object({ word: z.string(), count: z.number().int() })),
  /** A few recent corrections to review. */
  recentCorrections: z.array(z.object({ original: z.string(), corrected: z.string(), category: GrammarCategory })),
});
export type Progress = z.infer<typeof Progress>;

/** Every correction of one mistake type, newest first. */
export const MistakeList = z.object({
  category: GrammarCategory,
  items: z.array(
    z.object({
      original: z.string(),
      corrected: z.string(),
      explanation: z.string(),
      createdAt: z.string(),
      conversationId: z.string(),
      scenarioTitle: z.string(),
    }),
  ),
});
export type MistakeList = z.infer<typeof MistakeList>;

// ───────────── "Say it 3 ways" ─────────────

export const SayItRequest = z.object({ text: z.string().trim().min(2).max(300) });
export type SayItRequest = z.infer<typeof SayItRequest>;

export const SayItResult = z.object({
  natural: z.string(),
  professional: z.string(),
  casual: z.string(),
  /** When to use which, in the feedback language. */
  tip: z.string(),
});
export type SayItResult = z.infer<typeof SayItResult>;

// ───────────── Replays ("try that answer again") ─────────────

export const ReplayRequest = z.object({ turnSeq: z.number().int().nonnegative() });
export type ReplayRequest = z.infer<typeof ReplayRequest>;

/** Both attempts at the same moment, compared (scores on the usual 0–100 band scale). */
export const ReplayResult = z.object({
  firstScore: z.number().int(),
  secondScore: z.number().int(),
  firstComment: z.string(),
  secondComment: z.string(),
  improved: z.string(),
  stillToWork: z.string(),
  betterAnswer: z.string(),
});
export type ReplayResult = z.infer<typeof ReplayResult>;

export const ConversationDetail = ConversationSummary.extend({
  accent: Accent,
  analysisStatus: AnalysisStatus,
  feedback: Feedback.nullable(),
  recording: RecordingInfo.nullable(),
  brief: ConversationBrief,
  goals: z.array(z.object({ id: z.string(), description: z.string(), achieved: z.boolean() })),
  /** Missions: the mission's id (to retry or go to the next level). */
  missionId: z.string().nullable(),
  /** Replays only: which moment was replayed, both answers and their comparison (null while it is prepared). */
  replay: z
    .object({
      originalId: z.string(),
      turnSeq: z.number().int(),
      question: z.string(),
      originalAnswer: z.string(),
      newAnswer: z.string().nullable(),
      result: ReplayResult.nullable(),
    })
    .nullable(),
  turns: z.array(TranscriptTurn),
});
export type ConversationDetail = z.infer<typeof ConversationDetail>;
