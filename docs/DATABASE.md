# Database Design

**Engine:** PostgreSQL 16+ · **ORM:** Prisma (`packages/db`) · **Status:** Proposed — pending approval.

## Conventions

- IDs: `String @id @default(cuid(2))`-style or UUIDv7. **Proposal: UUIDv7**, which is time-sortable and index-friendly.
- All tables have `createdAt`, and mutable ones have `updatedAt`. Timestamps are `timestamptz`.
- Money is in integer **micro-units** (`BigInt`) with an explicit currency. There are no floats.
- **User deletion is a hard delete with cascade** (privacy, PRD §52). Only aggregated, anonymised usage survives, in `DailyUsageRollup` without a `userId`.
- Published content (`ScenarioVersion`, `PromptTemplate`) is **immutable**. Edits create a new version.
- JSON columns are allowed only where a Zod schema in `packages/contracts` owns the shape. They are validated on write and on read.

## MVP entity map

```text
User 1─1 Profile          User 1─1 UserSettings        User 1─1 LearningProfile
User 1─* AuthAccount / AuthSession / Verification   (Better Auth tables)
User 1─* ConversationSession ─1 ScenarioVersion ─* Scenario ─* ScenarioCategory
                            ├─1 Persona ─1 Voice
                            ├─* ConversationConnection (one per provider call; reconnects)
                            ├─* ConversationTurn
                            ├─* ConversationEvent
                            ├─0..1 SessionAnalysis ─* GrammarError
                            │                      ├─* VocabularyItem
                            │                      ├─1 FluencyMetrics
                            │                      └─* PracticeRecommendation
                            └─* UsageRecord
PromptTemplate (CORE | SAFETY | DIFFICULTY | LIVE_CORRECTION | EVALUATION), versioned
ModelPrice (per model, per unit type, effective dates)
```

## Prisma schema (MVP draft)

```prisma
// ───────────── Identity ─────────────
enum Role { USER ADMIN }

model User {
  id            String   @id @db.Uuid
  email         String   @unique
  emailVerified Boolean  @default(false)
  name          String?
  image         String?
  role          Role     @default(USER)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  profile         Profile?
  settings        UserSettings?
  learningProfile LearningProfile?
  sessions        ConversationSession[]
  usageRecords    UsageRecord[]
  // Better Auth: accounts, authSessions, verifications (generated to match its adapter schema)
}

enum EnglishLevel { BEGINNER INTERMEDIATE UPPER_INTERMEDIATE ADVANCED EXPERT }

model Profile {
  userId           String        @id @db.Uuid
  user             User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  displayName      String?
  nativeLanguage   String?       // BCP-47, e.g. "hi", "mr", "ta"
  selfReportedLevel EnglishLevel?
  goals            String[]      // e.g. ["interviews", "work_meetings"]
  timezone         String        @default("Asia/Kolkata")
  onboardedAt      DateTime?
  updatedAt        DateTime      @updatedAt
}

enum AudioRetention { NONE SESSION_ONLY DAYS_30 }

model UserSettings {
  userId            String         @id @db.Uuid
  user              User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  feedbackLanguage  String         @default("en")
  liveCorrection    Boolean        @default(false)
  audioRetention    AudioRetention @default(NONE)
  defaultDifficulty EnglishLevel   @default(INTERMEDIATE)
  defaultDurationSec Int           @default(600)
  preferredVoiceGender VoiceGender?
  notificationsEnabled Boolean     @default(true)
  updatedAt         DateTime       @updatedAt
}

// ───────────── Content ─────────────
model ScenarioCategory {
  id        String     @id @db.Uuid
  slug      String     @unique
  name      String
  sortOrder Int        @default(0)
  scenarios Scenario[]
}

model Scenario {
  id               String   @id @db.Uuid
  slug             String   @unique            // "job-interview"
  categoryId       String   @db.Uuid
  category         ScenarioCategory @relation(fields: [categoryId], references: [id])
  isActive         Boolean  @default(false)    // admin toggle (PRD §77)
  publishedVersionId String? @unique @db.Uuid
  publishedVersion ScenarioVersion? @relation("Published", fields: [publishedVersionId], references: [id])
  versions         ScenarioVersion[] @relation("Versions")
  sortOrder        Int      @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

enum ContentStatus { DRAFT PUBLISHED ARCHIVED }

model ScenarioVersion {
  id             String   @id @db.Uuid
  scenarioId     String   @db.Uuid
  scenario       Scenario @relation("Versions", fields: [scenarioId], references: [id])
  version        Int
  status         ContentStatus @default(DRAFT)
  kind           String        // "casual" | "interview" | "client" | "debate" | "negotiation" → selects params schema
  title          String
  description    String
  briefing       String        // shown to user pre-call (PRD §24)
  aiRole         String
  userRole       String
  objective      String
  minLevel       EnglishLevel  @default(BEGINNER)
  params         Json          // validated by per-kind Zod schema; may contain hidden fields
  goals          Json          // [{id, description}]
  vocabulary     Json          // target vocabulary list
  rubric         Json          // evaluation criteria & skill weights
  promptTemplate String        // scenario layer text
  completion     Json          // completion conditions
  createdById    String?  @db.Uuid
  publishedAt    DateTime?
  createdAt      DateTime @default(now())
  publishedFor   Scenario? @relation("Published")
  sessions       ConversationSession[]
  @@unique([scenarioId, version])
}

enum VoiceGender { FEMALE MALE NEUTRAL }

model Voice {
  id              String   @id @db.Uuid
  provider        String   // "openai"
  providerVoiceId String
  label           String
  gender          VoiceGender
  isActive        Boolean  @default(true)
  personas        Persona[]
  @@unique([provider, providerVoiceId])
}

model Persona {
  id            String   @id @db.Uuid
  name          String            // "Priya", "Daniel"
  avatarUrl     String?
  voiceId       String   @db.Uuid
  voice         Voice    @relation(fields: [voiceId], references: [id])
  personality   String[]          // ["friendly","talkative"]
  ageStyle      String            // "young" | "adult" | "senior"
  accentHint    String?           // best-effort only
  promptFragment String
  isActive      Boolean  @default(true)
  version       Int      @default(1)
  sessions      ConversationSession[]
}

enum PromptKind { CORE SAFETY DIFFICULTY LIVE_CORRECTION EVALUATION }

model PromptTemplate {
  id          String        @id @db.Uuid
  kind        PromptKind
  key         String        @default("default")   // e.g. difficulty level
  version     Int
  status      ContentStatus @default(DRAFT)
  content     String
  contentHash String
  createdAt   DateTime      @default(now())
  @@unique([kind, key, version])
}

// ───────────── Conversations ─────────────
enum SessionStatus { CREATED CONNECTING ACTIVE RECONNECTING ENDED FAILED EXPIRED }
enum EndReason { USER_ENDED TIME_LIMIT OBJECTIVE_COMPLETED AI_NATURAL_END CONNECTION_LOST HEARTBEAT_LOST QUOTA_EXHAUSTED SERVER_RESTART ERROR }
enum AnalysisStatus { PENDING PROCESSING COMPLETED FAILED SKIPPED }

model ConversationSession {
  id                 String   @id @db.Uuid
  userId             String   @db.Uuid
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scenarioVersionId  String   @db.Uuid
  scenarioVersion    ScenarioVersion @relation(fields: [scenarioVersionId], references: [id])
  personaId          String   @db.Uuid
  persona            Persona  @relation(fields: [personaId], references: [id])
  voiceId            String   @db.Uuid                 // resolved (handles "random")
  difficulty         EnglishLevel
  liveCorrection     Boolean
  plannedDurationSec Int
  mode               String   @default("STANDARD")      // STANDARD | SURPRISE | RETRY (post-MVP)
  retryOfSessionId   String?  @db.Uuid
  status             SessionStatus @default(CREATED)
  endReason          EndReason?
  startedAt          DateTime?
  endedAt            DateTime?
  durationMs         Int?
  userSpeakingMs     Int?
  // Reproducibility (PRD §78)
  promptVersionIds   Json     // {core, safety, difficulty, liveCorrection?}
  personaVersion     Int
  realtimeModel      String
  instructionsHash   String
  instructionsSnapshot String  // full assembled text; admin-only
  scenarioStateFinal Json?
  analysisStatus     AnalysisStatus @default(PENDING)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  connections ConversationConnection[]
  turns       ConversationTurn[]
  events      ConversationEvent[]
  analysis    SessionAnalysis?
  usage       UsageRecord[]

  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
}

model ConversationConnection {
  id             String   @id @db.Uuid
  sessionId      String   @db.Uuid
  session        ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  providerCallId String   @unique
  attempt        Int
  connectedAt    DateTime?
  closedAt       DateTime?
  closeReason    String?
}

enum Speaker { USER AI }
enum TranscriptSource { REALTIME_ASR POST_ASR MODEL_OUTPUT }

model ConversationTurn {
  id             String   @id @db.Uuid
  sessionId      String   @db.Uuid
  session        ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  seq            Int
  speaker        Speaker
  providerItemId String?             // idempotency for event replays
  text           String
  source         TranscriptSource
  startMs        Int                 // offset from session start
  endMs          Int?
  interrupted    Boolean  @default(false)
  audioObjectKey String?             // only when retention enabled
  metadata       Json?
  grammarErrors  GrammarError[]
  @@unique([sessionId, seq])
  @@unique([sessionId, providerItemId])
}

model ConversationEvent {
  id        BigInt   @id @default(autoincrement())
  sessionId String   @db.Uuid
  session   ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  type      String   // SPEECH_STARTED, SPEECH_STOPPED, AI_FIRST_AUDIO, PLAYBACK_END, INTERRUPTION, TOOL_CALL, RECONNECT, ERROR, WRAP_UP_SENT ...
  atMs      Int
  payload   Json?
  @@index([sessionId, atMs])
}

// ───────────── Analysis ─────────────
model SessionAnalysis {
  id               String   @id @db.Uuid
  sessionId        String   @unique @db.Uuid
  session          ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  overallScore     Int                 // 0–100, multiple of 5
  skills           Json                // {grammar:{band,score,rationale,evidenceTurnIds}, ...}
  summary          String
  strengths        String[]
  focusAreas       String[]
  conversationSkills Json
  translationPatterns String[]
  feedbackLanguage String
  evalModel        String
  evalPromptVersionId String @db.Uuid
  groundingDropped Int      @default(0)
  createdAt        DateTime @default(now())

  grammarErrors    GrammarError[]
  vocabularyItems  VocabularyItem[]
  fluency          FluencyMetrics?
  recommendations  PracticeRecommendation[]
}

enum Severity { LOW MEDIUM HIGH }

model GrammarError {
  id          String   @id @db.Uuid
  analysisId  String   @db.Uuid
  analysis    SessionAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  turnId      String   @db.Uuid
  turn        ConversationTurn @relation(fields: [turnId], references: [id], onDelete: Cascade)
  userId      String   @db.Uuid          // denormalised for "common mistakes" queries
  original    String
  corrected   String
  category    String                     // controlled list in contracts (PAST_TENSE, ARTICLES, ...)
  explanation String
  severity    Severity
  @@index([userId, category])
}

enum VocabKind { REPEATED UPGRADE GOOD_USAGE }

model VocabularyItem {
  id           String   @id @db.Uuid
  analysisId   String   @db.Uuid
  analysis     SessionAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  userId       String   @db.Uuid
  kind         VocabKind
  term         String
  alternatives String[]
  example      String?
  @@index([userId, kind])
}

model FluencyMetrics {
  analysisId         String @id @db.Uuid
  analysis           SessionAnalysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  userSpeakingMs     Int
  userTurns          Int
  wordsPerMinute     Int
  meanUtteranceWords Float
  typeTokenRatio     Float
  fillerCounts       Json    // {"um": 7, "like": 3}
  fillersPerMinute   Float
  latencyP50Ms       Int?
  latencyP90Ms       Int?
  longPauseCount     Int
  interruptionsByUser Int
}

model PracticeRecommendation {
  id         String   @id @db.Uuid
  analysisId String?  @db.Uuid
  analysis   SessionAnalysis? @relation(fields: [analysisId], references: [id], onDelete: Cascade)
  userId     String   @db.Uuid
  type       String   // SCENARIO | GRAMMAR_FOCUS | VOCAB_CHALLENGE | SHADOWING
  scenarioId String?  @db.Uuid
  reason     String
  dismissedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([userId, createdAt(sort: Desc)])
}

model LearningProfile {
  userId            String   @id @db.Uuid
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  englishLevel      EnglishLevel?
  grammarBand       Float?
  vocabularyBand    Float?
  fluencyBand       Float?
  pronunciationBand Float?   // null until pronunciation ships
  commonErrors      Json     // [{category, count, lastSeenAt}]
  commonFillers     Json
  weakTopics        String[]
  strongTopics      String[]
  preferredScenarioIds String[]
  totalSpeakingMs   BigInt   @default(0)
  conversationCount Int      @default(0)
  lastSessionId     String?  @db.Uuid     // idempotency guard for roll-up
  updatedAt         DateTime @updatedAt
}

// ───────────── Usage & cost ─────────────
enum UsageKind { REALTIME EVALUATION TRANSCRIPTION }

model UsageRecord {
  id                 String    @id @db.Uuid
  userId             String    @db.Uuid
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sessionId          String?   @db.Uuid
  session            ConversationSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)
  kind               UsageKind
  model              String
  inputAudioTokens   Int       @default(0)
  outputAudioTokens  Int       @default(0)
  inputTextTokens    Int       @default(0)
  outputTextTokens   Int       @default(0)
  cachedInputTokens  Int       @default(0)
  inputAudioMs       Int       @default(0)
  outputAudioMs      Int       @default(0)
  estimatedCostMicros BigInt   // USD micro-dollars
  createdAt          DateTime  @default(now())
  @@index([userId, createdAt])
}

model ModelPrice {
  id            String   @id @db.Uuid
  model         String
  unit          String   // "input_audio_token" | "output_audio_token" | ...
  microsPerMillion BigInt
  effectiveFrom DateTime
  @@index([model, unit, effectiveFrom])
}

model DailyUsageRollup {        // anonymised; survives user deletion
  day             DateTime @db.Date
  model           String
  sessions        Int
  audioMs         BigInt
  costMicros      BigInt
  @@id([day, model])
}
```

## Deferred tables (post-MVP, names reserved)

`learning_goals`, `pronunciation_results`, `shadowing_attempts`, `achievements`, `user_achievements`, `streaks` (derivable from sessions in MVP, so no table), `subscriptions`, `entitlements`, `notifications`, `push_tokens`, `organizations`, `org_members`, `reported_issues`, `analytics_events` (use a product-analytics tool instead of Postgres).

## Quotas without a subscriptions table (MVP)

Free-tier enforcement uses `SUM(UsageRecord.inputAudioMs)` for the user's local day, cached in Redis (`quota:{userId}:{yyyy-mm-dd}`), plus a check against `FREE_DAILY_SECONDS` at create/connect time and a server timer that ends the call when the remaining allowance runs out.

## Seed data

`packages/db/seed.ts` creates the 5 MVP scenarios (PRD §63) as `PUBLISHED` v1, 4 personas (2 female, 2 male), the voice rows, v1 prompt templates for every `PromptKind`, and one admin user from `SEED_ADMIN_EMAIL`.
