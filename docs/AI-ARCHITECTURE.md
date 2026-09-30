# AI Architecture

**Status:** Proposed — pending approval.
Covers the provider abstraction, the Conversation Engine, prompt layering, difficulty and personas, and the evaluation pipeline.

---

## 1. Two AIs, deliberately separate (PRD §76)

|  | Conversation AI | Evaluation AI |
|---|---|---|
| When | Live, during the call | After the call, in the worker |
| Model class | Speech-to-speech realtime model | Text reasoning model with structured output |
| Optimised for | Latency, naturalness, staying in character | Accuracy, grounding, structured feedback |
| Sees | Layered instructions + live audio | Full transcript + timings + scenario rubric + learner profile |
| Must never | Act like a teacher (unless live-correction is ON) | Invent errors that are not in the transcript |
| Interface | `RealtimeVoiceProvider` | `EvaluationProvider` |

---

## 2. Provider interfaces (`packages/ai`)

This replaces the PRD's single `AIProvider` (Amendment A1). Audio never goes through the backend, so there is no `sendAudio`/`receiveAudio` on the server side.

```ts
// Realtime (voice) — implemented by OpenAIRealtimeProvider
interface RealtimeVoiceProvider {
  /** Exchange the device's SDP offer for an answer, binding the session config server-side. */
  createCall(input: { sdpOffer: string; config: RealtimeSessionConfig }): Promise<{ sdpAnswer: string; callId: string }>;
  /** Open the server-side control channel for an existing call. */
  attachControl(callId: string): Promise<RealtimeControl>;
}

interface RealtimeControl {
  updateSession(patch: Partial<RealtimeSessionConfig>): Promise<void>;
  seedHistory(items: SeedItem[]): Promise<void>;          // used on reconnect
  requestResponse(opts?: { instructions?: string }): Promise<void>; // e.g. AI speaks first
  cancelResponse(): Promise<void>;
  sendToolResult(callId: string, output: unknown): Promise<void>;
  hangup(): Promise<void>;
  events(): AsyncIterable<RealtimeEvent>;                  // normalised, provider-agnostic
  close(): Promise<void>;
}

type RealtimeEvent =
  | { type: 'user.speech_started'; atMs: number }
  | { type: 'user.speech_stopped'; atMs: number }
  | { type: 'user.transcript'; itemId: string; text: string; atMs: number }
  | { type: 'ai.response_started'; responseId: string; atMs: number }
  | { type: 'ai.first_audio'; responseId: string; atMs: number }
  | { type: 'ai.transcript'; itemId: string; text: string; interrupted: boolean; atMs: number }
  | { type: 'ai.tool_call'; callId: string; name: string; args: unknown }
  | { type: 'usage'; usage: RealtimeUsage }
  | { type: 'error'; code: string; message: string; fatal: boolean }
  | { type: 'closed'; reason: string };

// Evaluation — implemented by OpenAIEvaluationProvider
interface EvaluationProvider {
  evaluateSession(input: EvaluationInput): Promise<ValidatedEvaluation>; // Zod-validated
}
```

Normalisation into `RealtimeEvent` happens only in `OpenAIRealtimeProvider`, so provider event names never leak into the engine. Pronunciation (`evaluatePronunciation`) is **not** in the MVP interface. It needs audio plus a specialised scoring service (for example, a pronunciation-assessment API), and it will be added as a separate `PronunciationProvider` when shadowing ships.

---

## 3. Prompt layering (PRD §71)

Instructions are assembled from separately versioned layers, in a fixed order. Each layer is short, and the whole prompt is a composition rather than one giant prompt.

| # | Layer | Source | Versioned in | Changes during call? |
|---|---|---|---|---|
| 1 | **Core system**: "You are a character in a spoken role-play…", speaking style for voice (short turns, no lists, no markdown, no emojis), never mention being an English tutor unless live-correction is on | `PromptTemplate(kind=CORE)` | DB | No |
| 2 | **Safety**: boundaries for difficult personas, no sexual content, no real-person impersonation, no requests for sensitive personal data, what to do if the user is distressed | `PromptTemplate(kind=SAFETY)` | DB | No |
| 3 | **Scenario**: AI role, user role, setting, objective, hidden parameters (e.g. seller's floor price), goals, branches, completion conditions, opening line guidance | `ScenarioVersion` | DB | No |
| 4 | **Persona**: name, personality traits, age style, accent hint, speech habits | `Persona` | DB | No |
| 5 | **Difficulty**: behaviour rules (table §4) | `PromptTemplate(kind=DIFFICULTY, key=level)` | DB | Can escalate/de-escalate (post-MVP) |
| 6 | **Learner profile**: level, 1–3 target weaknesses expressed as *conversational opportunities* ("naturally ask about past events"), never as instructions to teach | Derived from `LearningProfile` | Computed | No |
| 7 | **Live correction**: only present if ON: "At most once every few minutes, if a major error blocks meaning, briefly recast it naturally and continue" | `PromptTemplate(kind=LIVE_CORRECTION)` | DB | No |
| 8 | **Session state**: time remaining, goals achieved, wrap-up signal | Conversation Engine | Runtime | **Yes**, via `session.update` |

The assembled text and a hash are stored on the session (`instructionsSnapshot`, `instructionsHash`), together with every layer's version id. This makes any conversation reproducible (PRD §78).

Templates use a small, safe interpolation (`{{scenario.aiRole}}`). There is no code execution in templates, and every variable is checked against a Zod schema before rendering.

---

## 4. Personas, voices, difficulty

**Voices** map a provider voice id to `gender` (FEMALE / MALE / NEUTRAL) and a label. "Random" is resolved server-side at session creation and stored.

**Accent** (PRD §16) is a persona *hint* in the instructions. Realtime voices have a fixed timbre, so accent adherence varies and **is not guaranteed** (Amendment A7). The UI labels it "style", not a promise. It is never scored.

**Difficulty → behaviour**

| Level | Speech rate / length | Vocabulary | Behaviour | VAD eagerness |
|---|---|---|---|---|
| Beginner | Slow, 1–2 short sentences | Common words, no idioms | Patient, rephrases when the user is stuck, offers "I don't know the word" help readily | Low (tolerate long pauses) |
| Intermediate | Normal, 1–3 sentences | Natural | Follow-up questions on every answer | Auto |
| Upper-Int | Normal-fast | Natural + some phrasal verbs | Occasional topic shifts, asks the user to elaborate | Auto |
| Advanced | Fast | Idioms, indirect phrasing | Disagrees, pushes back, expects justification | Auto/high |
| Expert | Native pace | Full range | Unexpected turns, subtle implication, hard negotiation | High |

Speech rate is controlled via the session speed setting if the provider supports it, and otherwise via instructions. **[SPIKE S2]**

---

## 5. Conversation Engine

A server-side domain service that owns each live session. The LLM decides *what to say*. The engine decides *what the session is*.

**State** (in memory on the owning instance, persisted incrementally):

```ts
interface EngineState {
  sessionId: string;
  status: SessionStatus;
  startedAtMs: number;
  plannedDurationMs: number;
  goals: Array<{ id: string; description: string; achieved: boolean }>;
  scenarioState: Record<string, unknown>; // validated by the scenario's paramsSchema, e.g. { currentAskPrice: 2200 }
  turnCount: number;
  wrapUpSent: boolean;
}
```

> **M2 decision:** the realtime model only gets `end_conversation`, plus `record_offer` for negotiations. `mark_goal_achieved` was tried and removed, because each extra tool call added noticeable response latency and goal judging belongs to the evaluation AI. The table below is the original design.

**Tools exposed to the realtime model.** The set is kept small because every tool call risks adding latency to that turn:

| Tool | Purpose | Server handling |
|---|---|---|
| `mark_goal_achieved(goalId)` | E.g. "salary discussed", "deal agreed" | Update state. Reply `{ok:true}` immediately. |
| `update_scenario_state(patch)` | Scenario-specific numbers (current price, AI's stance) | Validate against the scenario schema, clamp to constraints (e.g. the seller never goes below the floor), reply with the clamped state |
| `end_conversation(reason)` | Natural completion: the AI has already said goodbye | Allow the goodbye audio to finish, then hang up. `endReason = AI_NATURAL_END` or `OBJECTIVE_COMPLETED`. |

Tool results must be returned immediately, with no DB round-trip on the hot path. Persistence is fire-and-forget into an in-process buffer that flushes to Postgres every few seconds and on end.

**Ending (PRD §26)**

- User taps End → server `hangup` → `USER_ENDED`.
- Time: wrap-up nudge at T−60 s, hard stop at T+30 s → `TIME_LIMIT`.
- Model calls `end_conversation` → `AI_NATURAL_END` / `OBJECTIVE_COMPLETED`. Guard: this is ignored if fewer than 60 s have elapsed or the user has spoken fewer than 3 turns, so the model cannot end sessions early.
- Heartbeat loss, quota exhausted, reconnection failed → as described in VOICE-ARCHITECTURE §5–6.

**Scenario parameters** (PRD §74) are stored in `ScenarioVersion.params` (JSON) and validated by a per-`scenarioKind` Zod schema in `packages/contracts`. That is the only scenario-specific code: a schema, not logic. Example (Bargaining):

```json
{
  "kind": "negotiation",
  "item": "leather jacket",
  "currency": "INR",
  "askPrice": 2500,
  "floorPrice": 1700,
  "userBudget": 1500,
  "aiStance": "friendly but firm; concedes in small steps; walks away if insulted"
}
```

The user only sees the brief ("You have ₹1,500. The seller wants ₹2,500."). `floorPrice` stays in the instructions and is never sent to the client.

---

## 6. Evaluation pipeline (worker, queue `analysis`)

Triggered on `ENDED` if user speaking time is at least 30 s (otherwise `analysisStatus = SKIPPED`, with a friendly "too short to analyse" message).

```text
1. Load       session, turns (ordered), events, scenario version rubric, learner profile, feedback language
2. Metrics    DETERMINISTIC (packages/shared, unit-tested):
              - speaking time, turn count, words/min (user words ÷ user speech time)
              - filler counts per lexicon {um, uh, er, like*, you know, actually, basically, I mean}
                (*"like" only when not a verb/preposition, via simple heuristics + LLM confirmation)
              - response latency distribution (p50, p90), long pauses (> 5 s) as counts, not penalties
              - mean length of utterance, type–token ratio, repeated n-grams
3. LLM        EvaluationProvider.evaluateSession() with Structured Outputs (JSON Schema generated
              from the Zod schema). Input: numbered user turns (U1..Un) with AI context,
              metrics from step 2 as FACTS, rubric, level, feedback language.
4. Validate   Zod parse → on failure, retry once with the validation error → else FAILED (retryable)
5. Ground     Drop any grammar error whose `original` is not a (normalised) substring of the cited
              user turn. Drop vocabulary items citing words the user never said. Log drop rate as a
              quality metric.
6. Score      Each skill → band 1–5 with a one-sentence rationale citing evidence.
              Displayed 0–100 = band-derived and rounded to 5 (Amendment A3). Overall = weighted mean
              (weights per scenario rubric). UI always shows rationale next to the number.
7. Persist    SessionAnalysis, GrammarError[], VocabularyItem[], FluencyMetrics, PracticeRecommendation[]
8. Profile    enqueue `learning-profile.update` (idempotent per session): roll up error categories,
              fillers, topic strengths; recompute levels with exponential decay (recent sessions weigh more)
9. Notify     control channel / push: "Your feedback is ready"
```

**Evaluation output schema** (in `packages/contracts`, abbreviated):

```ts
const SkillAssessment = z.object({
  band: z.number().int().min(1).max(5),
  rationale: z.string().max(300),
  evidenceTurnIds: z.array(z.string()).max(5),
});

const Evaluation = z.object({
  skills: z.object({
    grammar: SkillAssessment, vocabulary: SkillAssessment, fluency: SkillAssessment,
    conversationFlow: SkillAssessment, relevance: SkillAssessment, clarity: SkillAssessment,
  }),
  summary: z.string().max(600),
  strengths: z.array(z.string()).max(3),
  focusAreas: z.array(z.string()).max(3),
  grammarErrors: z.array(z.object({
    turnId: z.string(), original: z.string(), corrected: z.string(),
    category: GrammarCategory, explanation: z.string().max(400),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  })).max(15),
  vocabulary: z.array(z.object({
    kind: z.enum(['REPEATED', 'UPGRADE', 'GOOD_USAGE']),
    term: z.string(), alternatives: z.array(z.string()).max(4), example: z.string().optional(),
  })).max(8),
  conversationSkills: z.object({       // PRD §33 — observations, not scores
    askedQuestions: z.boolean(), elaborated: z.boolean(), disagreedPolitely: z.boolean().nullable(),
    clarified: z.boolean().nullable(), notes: z.string().max(400),
  }),
  translationPatterns: z.array(z.string()).max(3), // PRD §43 — phrased as patterns, never "you thought in Hindi"
  recommendations: z.array(z.object({ type: RecommendationType, reason: z.string() })).max(4),
});
```

Explanations are written in the user's **feedback language** (PRD §42). Corrected sentences are always in English.

**Pronunciation and listening** are excluded from MVP scoring. Transcript-only analysis cannot judge them honestly, and the UI will show "coming soon" rather than a fabricated score.

---

## 7. Quality & evals

- `packages/ai/evals/`: a fixed set of about 40 synthetic transcripts with known, labelled errors, run in CI against the evaluation prompt with a pinned model. We track precision/recall of grammar errors and grounding drop rate. A prompt version cannot be published if recall regresses by more than 5 pts.
- Role-play regression: scripted user-side text runs through the realtime model in text mode to check that it stays in character, does not correct the user when live-correction is OFF, and respects the floor price and safety boundaries.
- Every session stores prompt layer versions and model ids, so production issues can be replayed.

---

## 8. Cost model inputs

`UsageRecord` stores the provider-reported token counts per call (audio in/out, text in/out, cached) and per evaluation, plus `estimatedCostMicros` computed from a `ModelPrice` table (not hard-coded, because prices change). Levers to keep costs down:

- Keep instructions stable so prompt caching applies.
- Keep AI turns short by persona design, since output audio is the dominant cost.
- Cap duration on the server.
- Use a cheaper realtime tier for Beginner/Friendly if Spike S5 shows the quality holds.
