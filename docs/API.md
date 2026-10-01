# API Specification

**Status:** Proposed — pending approval. **Base URL:** `${APP_BASE_URL}/v1`
All request and response bodies are defined as Zod schemas in `packages/contracts`, with the NestJS validation pipe using those same schemas. An OpenAPI document is generated from them at `/v1/docs` (non-production only).

## Conventions

| Topic | Rule |
|---|---|
| Auth | Mobile: `Authorization: Bearer <session token>`. Web: httpOnly, `Secure`, `SameSite=Lax` cookie. Both are issued by Better Auth. |
| Errors | RFC 9457 `application/problem+json`: `{ type, title, status, detail, code, traceId }`. `code` is a stable enum, e.g. `QUOTA_EXCEEDED`, `SESSION_NOT_CONNECTABLE`. |
| Ownership | Every `:id` resource is looked up **scoped by `userId`**. A resource that belongs to another user returns **404**, not 403, so ids cannot be probed. |
| Pagination | Cursor-based: `?cursor=<opaque>&limit=20` → `{ items, nextCursor }` |
| Idempotency | `POST /conversations` accepts an `Idempotency-Key` header (stored for 24 h in Redis) |
| Rate limits | Redis-backed and applied per user and per IP. Tighter limits apply to auth and conversation-create routes (see SECURITY.md). |
| Versioning | URL prefix `/v1`. Breaking changes → `/v2`. Contracts are shared, so web and mobile break at compile time. |
| Time | ISO-8601 UTC strings. Durations are in ms or s, and the unit is stated in the field name. |

---

## Auth (Better Auth, mounted at `/v1/auth/*`)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/sign-up/email` | `{ email, password, name }`. Sends a verification email. |
| POST | `/auth/sign-in/email` | `{ email, password }` |
| POST | `/auth/sign-in/social` | `{ provider: "google", idToken? }`. Mobile uses the native Google ID-token flow. |
| POST | `/auth/sign-out` | |
| POST | `/auth/forget-password`, `/auth/reset-password` | |
| GET | `/auth/get-session` | Current session + user |

(Paths follow the library's conventions. The PRD's `/auth/login` and `/auth/register` map onto these.)

---

## Profile & settings

| Method | Path | Body / Response |
|---|---|---|
| GET | `/me` | `{ user, profile, settings, quota: { dailySecondsLimit, dailySecondsUsed, resetsAt } }` |
| PATCH | `/me/profile` | `{ displayName?, nativeLanguage?, selfReportedLevel?, goals?, timezone? }` |
| PATCH | `/me/settings` | `{ feedbackLanguage?, liveCorrection?, audioRetention?, defaultDifficulty?, defaultDurationSec?, preferredVoiceGender?, notificationsEnabled? }` |
| POST | `/me/onboarding` | Completes onboarding: level self-assessment + goals |
| DELETE | `/me` | Hard-deletes the account and all data, and purges stored audio (async job). Requires re-auth within the last 5 min. → `202` |
| GET | `/me/export` | Data export (JSON) — PRD §52 / DPDP readiness |

## Catalog

| Method | Path | Response |
|---|---|---|
| GET | `/scenarios` | `[{ id, slug, category, title, description, minLevel, estimatedMinutes }]`, active only |
| GET | `/scenarios/:id` | `{ ..., briefing, objective, userRole }` — **never** hidden params, goals or prompt text |
| GET | `/personas` | `[{ id, name, avatarUrl, gender, personality, ageStyle, accentHint }]` |

## Conversations

> **As implemented in M2:** the catalog is `GET /v1/catalog` (scenarios + personas in one call), and the quota is `GET /v1/quota`. `POST /conversations/:id/connect` takes `{ sdpOffer, reconnect? }` and returns `{ sdpAnswer, durationSec }`. The WebRTC data channel from our voice gateway carries `{type:"floor"}`, `{type:"time_warning", secondsRemaining}` and `{type:"call.ended", reason}`, which replaces the separate control WebSocket described below.

### `POST /conversations` — create
```jsonc
// request
{ "scenarioId": "uuid", "personaId": "uuid" | null, "voiceGender": "FEMALE" | "MALE" | "RANDOM",
  "difficulty": "INTERMEDIATE", "durationSec": 600, "liveCorrection": false }
// 201
{ "id": "uuid", "status": "CREATED", "brief": { "title", "briefing", "objective", "userRole" },
  "persona": { "name", "avatarUrl" }, "plannedDurationSec": 600, "connectExpiresAt": "..." }
```
Errors: `QUOTA_EXCEEDED` (402), `SCENARIO_INACTIVE` (409), `ACTIVE_SESSION_EXISTS` (409, one live call per user), `VALIDATION_FAILED` (400).

### `POST /conversations/:id/connect` — WebRTC signalling (see VOICE-ARCHITECTURE §3)
```jsonc
// request  (Content-Type: application/json)
{ "sdpOffer": "v=0...", "reconnect": false }
// 200
{ "sdpAnswer": "v=0...", "connectionId": "uuid", "controlChannel": { "url": "wss://.../v1/realtime", "ticket": "short-lived-jwt" } }
```
Allowed only when status ∈ {CREATED, RECONNECTING} and within TTL. Errors: `SESSION_NOT_CONNECTABLE` (409), `PROVIDER_UNAVAILABLE` (503, retryable).

### `POST /conversations/:id/end`
`{ "reason": "USER_ENDED" }` → `200 { status: "ENDED", analysisStatus: "PENDING" }`. Idempotent.

### Read
| Method | Path | Response |
|---|---|---|
| GET | `/conversations?cursor&limit&scenarioId` | History list: `{ id, scenario{title}, persona{name}, startedAt, durationMs, overallScore?, analysisStatus }` |
| GET | `/conversations/:id` | Session detail + endReason |
| GET | `/conversations/:id/transcript` | `[{ id, seq, speaker, text, startMs, interrupted }]` |
| GET | `/conversations/:id/analysis` | `202 { analysisStatus }` while pending. Otherwise the full analysis: skills (band, score, rationale), summary, grammarErrors, vocabulary, fluency, conversationSkills, recommendations. |
| DELETE | `/conversations/:id` | Hard-delete the session + transcript + analysis + audio. The learning profile is recomputed asynchronously. |

## Progress & learning

| Method | Path | Response |
|---|---|---|
| GET | `/progress` | Totals, smoothed skill scores (incl. clarity), per-conversation history (last 20), streak + 28-day practice calendar (user's time zone), confidence indicators (recent 3 vs previous 3 conversations), common mistakes with trend, fillers, recent corrections |
| GET | `/missions` | Missions (objectives, AI character, skills — never prompts, secrets or outcome rules) with the user's level progress |
| POST | `/conversations/:id/say-it` | `{ text }` (a sentence from this conversation or its feedback) → `{ natural, professional, casual, tip }`; cached |
| POST | `/conversations/:id/replay` | `{ turnSeq }` → a short replay call of the question before that user line (CreateConversationResponse); the comparison appears on the replay's detail as `replay` |
| GET | `/progress/mistakes/:category` | The user's corrections of one mistake type (newest first, max 50) |
| GET | `/mistakes?category&cursor` | Grammar errors across sessions, grouped by category with counts |
| GET | `/vocabulary?kind&cursor` | Vocabulary items across sessions |
| GET | `/recommendations` | Active practice recommendations |
| POST | `/recommendations/:id/dismiss` | |

## Admin (`role = ADMIN`, web only)

| Method | Path |
|---|---|
| GET/POST | `/admin/scenarios`, `/admin/scenarios/:id/versions` (create draft) |
| POST | `/admin/scenario-versions/:id/publish` · `/admin/scenarios/:id/activate` · `/deactivate` |
| POST | `/admin/scenario-versions/:id/preview` → assembled instructions for review (no call) |
| GET/POST/PATCH | `/admin/personas`, `/admin/voices`, `/admin/prompts` (+ `/publish`) |
| GET | `/admin/users?q`, `/admin/users/:id` (metadata + usage; **transcripts not visible by default**, see SECURITY.md) |
| GET | `/admin/usage?from&to&groupBy=day|model|user` |
| GET | `/admin/sessions/:id/debug` → prompt versions, events, instructions snapshot (audit-logged) |

## Post-MVP (reserved)
`POST /practice/shadowing`, `GET /subscriptions`, `POST /conversations` with `mode: "SURPRISE" | "RETRY"`, `POST /telephony/calls`.

---

## Realtime control channel (WebSocket)

`wss://…/v1/realtime?ticket=<jwt>`. The ticket is single-use, lasts 60 s, and is scoped to one `sessionId` + `connectionId`. JSON messages are validated with Zod on both sides.

**Client → Server**

| type | payload | purpose |
|---|---|---|
| `heartbeat` | `{ t }` | Every 15 s. The server ends the call after 45 s with none. |
| `playback.ended` | `{ responseId, atClientMs }` | Measures user response latency |
| `audio.route` | `{ route: "earpiece" \| "speaker" \| "bluetooth" \| "wired" }` | Server adjusts noise-reduction mode |
| `mic.muted` | `{ muted }` | Analytics; the server pauses the idle timer while muted |
| `call.end` | `{}` | Same as REST end (either path works) |

**Server → Client**

| type | payload |
|---|---|
| `session.active` | `{ startedAt, plannedDurationSec }` |
| `session.time_warning` | `{ secondsRemaining }` |
| `session.reconnecting` | `{ attempt }` |
| `session.ended` | `{ endReason }` |
| `analysis.ready` | `{ sessionId }` |
| `error` | `{ code, message, fatal }` |

The provider's WebRTC data channel stays open (the provider requires it), and the client may use it for UI hints such as speaking/listening indicators from VAD events. Business decisions never depend on it.

## Analytics events (PRD §79)

Sent from clients to a product-analytics tool (TBD, e.g. PostHog). Server-side events are emitted for `conversation_started`, `conversation_completed`, `conversation_abandoned` and `analysis_completed`, so they cannot be spoofed. No transcript content goes into analytics.
