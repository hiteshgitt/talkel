# Development Plan

**Status:** Proposed — pending approval.

This plan re-orders PRD §65/§86 around one rule: **prove the call feels natural before building anything that depends on it.** Milestone 0 is a throwaway-quality but honest spike. Every later milestone ends with something runnable on a real Android phone.

---

## Milestone 0 — Voice POC (the go/no-go gate)

**Goal:** PRD §87 flow on a physical Android device, with nothing else.

```text
Open app → "Friendly Conversation" → female voice → Start → AI speaks first → user replies →
AI replies → user interrupts mid-sentence → AI stops and continues naturally → End → transcript shown
```

**Build (minimal, no DB, no auth):**
- pnpm + Turborepo skeleton with `apps/api`, `apps/mobile` and `packages/contracts`. This part is kept.
- `apps/api`: `POST /poc/connect` (SDP proxy, hard-coded friendly persona + instructions, dev-only static bearer token), sideband WS client that logs all events with timestamps to JSONL, AI-speaks-first, server hard-stop at 5 min, `GET /poc/transcript/:callId`.
- `apps/mobile`: Expo **development build**, a call screen (avatar, name, timer, mute, speaker toggle, end, listening/speaking indicator from VAD events), permissions, incall-manager routing, a transcript screen.
- `scripts/latency/`: a tool that turns a two-track external recording plus the event log into a mouth-to-ear latency report.

**Evaluate (Spikes S1–S5 in VOICE-ARCHITECTURE §10):** SDP-proxy + sideband works; latency; barge-in on earpiece, headset and speaker; transcript fidelity (errors + fillers); background survival; cost per 10 min.

**Deliverable:** `docs/spikes/M0-REPORT.md` with the measurements and a go/no-go per spike, plus any architecture changes they force. **You try it yourself on your phone before we continue.**

**Explicitly out of scope:** DB, auth, scenarios other than Friendly, analysis, web.

---

## Milestone 1 — Foundation

> **Status (2026-09-30): done**, apart from the items marked *deferred*.
> - **Built:** monorepo + CI; docker-compose (Postgres, Redis, Mailpit); `packages/db` (Prisma 7, first migration, test DB); API auth (Better Auth: email/password + verification + reset, Google ready once credentials exist); global session guard (secure by default); `/v1/me`, onboarding, profile and settings endpoints; `/v1/admin/stats` (admin role); health with a DB check; per-client rate limits; voice calls scoped to their owner; mobile sign-in/up, email verification with deep link back to the app, onboarding (level, goals, EN/HI feedback, consent) and the 5 tabs; web sign-in/up, password reset, dashboard and admin.
> - **Tests:** 53 unit + 16 API e2e (real Postgres), mobile/web typecheck + lint, web production build.
> - **Deferred:** pino structured logging and Sentry (no DSN yet); Renovate; an API ESLint config; Google sign-in (needs OAuth credentials from Google Cloud); account deletion/export (M4 as planned).

- Monorepo hardened: `packages/config` (tsconfig, eslint, prettier), Turborepo pipelines, GitHub Actions CI (lint, typecheck, test, build), gitleaks, Renovate.
- `docker-compose.yml` (Postgres, Redis). `packages/db` with the Prisma schema from DATABASE.md, migrations and seed.
- `packages/contracts`: env schemas, API DTOs, error codes.
- NestJS foundation: config module, pino logging, Sentry, problem+json filter, rate limiting, health, Zod validation pipe.
- Auth: Better Auth (email/password + Google), web cookies, mobile bearer + secure store, email verification.
- Mobile shell: expo-router tabs (Home, Practice, History, Progress, Profile), auth screens, onboarding (level + goals + feedback language + consent).
- Web shell: Next.js 16, auth pages, empty dashboard, `/admin` layout with role guard.

**Exit:** a user can sign up on the phone and on the web, and CI is green.

## Milestone 2 — Conversation lifecycle on real data

> **Status (2026-09-30): done** (server and app; the phone test is pending).
> - **Content:** 5 scenarios (casual, interview, client, debate, negotiation) with per-call randomised variants, and 4 personas, seeded as immutable versions. Sessions pin the scenario version, persona version and every prompt-layer version.
> - **Engine:** layered instructions (core, correction, safety, scenario, persona, difficulty, learner goals, tools). English-only rule. Per-level turn-taking. Tools are kept minimal for latency: `end_conversation` (refused in the first 45 s) and `record_offer` (a server-side clamp stops the seller going below its floor price).
> - **API:** `/v1/catalog`, `/v1/quota` (10 min per local day), `/v1/conversations` (create → connect → ready → end; list, detail, delete). Transcripts are saved every 10 s. Reconnection keeps the AI session alive for 20 s while the phone rejoins. Conversations left open by a restart are closed and still count toward the quota.
> - **Change from plan:** "goal achieved" is **not** a live tool. It added about 0.7 s of response latency, and judging belongs to the evaluation AI (PRD §76), so it moves to M3. Measured live response latency afterwards: 0.9–1.65 s.
> - **Tests:** 67 unit tests; 16 API e2e tests, including a full lifecycle over real WebRTC against a fake Gemini Live server; live calls in 4 scenarios against real Gemini.

- Catalog endpoints; the 5 MVP scenarios seeded (PRD §63); 4 personas.
- `conversation-engine`: instruction assembly (all layers), state machine, timers, wrap-up, heartbeat, tools (`mark_goal_achieved`, `update_scenario_state`, `end_conversation`) with clamping.
- `realtime` module promoted from the POC to the `RealtimeVoiceProvider` interface. Incremental turn/event persistence. Session-owner lock.
- Control-channel WebSocket gateway. Reconnection flow. Usage records + daily quota.
- Mobile: scenario list → brief → persona/voice/difficulty/duration → call → "Processing…" screen. Error states per PRD §70.

**Exit:** all 5 scenarios playable end to end; transcripts saved; killing the network mid-call recovers or ends gracefully without data loss; quota enforced.

## Milestone 2.5 — Voice, accent, recording (added at the product owner's request)

> **Status (2026-09-30): server done and tested; app build in progress.**
> - **Plans:** `users.plan` FREE/PRO. Free gets a random partner and accent; Pro chooses partner, voice (female/male/random) and accent (American/British/Indian/Australian/random), enforced on the server. `apps/api/scripts/set-plan.ts` sets the plan until payments exist.
> - **Accent:** a best-effort instruction layer (`accent-v1`), never scored.
> - **Clarity:** Opus full-band "audio" mode at 64 kbps with complexity 10, plus server-side loudness normalization with a soft limiter.
> - **Recording:** see SECURITY §2b. Verified live: recordings decode fully and contain both voices.
> - **Consent:** notice updated for recordings, with a one-time re-consent screen.

## Milestone 3 — Analysis

> **Status (2026-09-30): done** (server, app, tests; the phone check is pending).
> - **Live timing:** user speaking time and response latency after the AI stops, measured during the call.
> - **Queue:** BullMQ on Redis. The API enqueues on call end; `dist/worker.js` is a second process that retries with backoff.
> - **Metrics in code:** speech rate, fillers (context-aware: "like"/"you know" only as fillers), type/token ratio, latency p50/p90, long pauses.
> - **Evaluation AI:** Gemini text models (`EVAL_MODELS`, falling back 3.8 Flash → 3.5 Flash → 2.5 Flash on overload). Structured output uses a JSON Schema generated from Zod, then Zod validation.
> - **Guardrails:** corrections must quote the learner's actual words. Scores come from bands in code, and unknown goal ids and scenario slugs are dropped.
> - **Feedback language:** English or Hindi (explanations translated; corrections stay in English). Verified live.
> - **Learning profile:** smoothed skill bands, common mistake categories and fillers. Recurring mistakes feed the next conversation's instructions as natural practice opportunities (PRD §35).
> - **App:** feedback on the conversation screen (score, skills, corrections, vocabulary, fluency, goals, tips, recommended scenario) and a Progress tab.
> - **Known limit:** real-time transcription drops some fillers. A verbatim post-call pass on recordings (`gemini-3.5-transcribe`) would fix this for recorded calls.

- Worker entrypoint + BullMQ queues (`analysis`, `learning-profile`, `retention-cleanup`).
- Deterministic metrics in `packages/shared` (100% unit-tested).
- `EvaluationProvider` (OpenAI, structured outputs) + Zod + retry + grounding filter.
- Evaluation eval-set in CI (`packages/ai/evals`).
- Learning profile roll-up; adaptive layer-6 instructions for the next session.
- Mobile feedback screen: overall score with rationale, skills, grammar corrections, vocabulary, fillers, recommendations, "Try again".
- Feedback language setting: English + Hindi (decided).

**Exit:** feedback appears within 30 s p90 of call end; eval-set recall/precision baselines recorded.

## Milestone 4 — History, progress, web dashboard, admin

> **Status (2026-09-30): in progress.**
> - **Done — Progress (mobile):** streak + 28-day practice calendar, overall score per conversation (tap to open), skill trends incl. clarity, a "speaking confidence" card built only from measured signals (time to answer, words per answer, long pauses, fillers, asking questions — recent 3 vs previous 3 conversations; PRD §28, no single confidence %), mistake types with fewer/more trend and a drill-down of every example. Pure, unit-tested calculations in `apps/api/src/analysis/progress-stats.ts`.
> - **Done — richer feedback (eval-v2):** every real grammar mistake (≤20, major/minor), "say it more naturally" rewrites, conversation moments (too short, missed question, no follow-up, off topic, abrupt, unclear) with a better reply — all grounded on the learner's words — and mistakes underlined in the transcript (tap a line for its fixes). Gemini gets the schema without size limits (large limited schemas fail with 400 "invalid argument"); limits are applied in code (`clampEvaluation`) before strict Zod validation. Retired models are skipped; analysis jobs retry for ~10 min when every model is overloaded.
> - **Done — Talkel brand + redesign:** renamed to **Talkel — Your AI Conversation Partner** (logo, icons, splash; internal ids `com.speakai.app`, `speakai://` and `@speakai/*` unchanged until store launch). Light/dark themes following the phone, Ionicons, scenario art, gradients/SVG/haptics with fallbacks on older builds.
> - **Done — Missions (positioning: an AI *conversation simulator*, not a tutor):** a Missions tab next to Practice. A mission = situation + user objectives + an AI character with its own hidden objective + 5 pressure levels (Comfortable → Real world, independent of English level) + an outcome. After the call the evaluator judges SUCCESS / PARTIAL / FAILED from a per-mission outcome rule (which may reference the AI's secrets), with a factual headline ("Raise agreed at 10% (first offer 7%)") and mission-specific skills; mission score = ½ communication + ½ objectives. Passing a level unlocks the next (`mission_progress`). New generic `roleplay` scenario kind makes future missions content-only. 6 missions: Get the Job, Negotiate Your Raise, Calm an Angry Customer, Fix Your Hotel Problem, Win the Debate, Bargain Like a Local.
> - **Next (missions roadmap):** tougher characters and more missions; "Try that answer again" (replay one moment and compare); "say it 3 ways" (natural / professional / casual); personal memory with consent.
> - **Then:** Home (today's practice, recommended next), web dashboard, admin, account deletion + export.

- Mobile: History list/detail (transcript + analysis), Progress (speaking minutes, streak, skill trends), Home (today's practice, recommended next).
- Web: overview, skills, mistakes, vocabulary, history.
- Admin: scenario/persona/prompt versioning with draft → preview → publish, activate/deactivate, users, usage/cost dashboard, session debug view (audit-logged).
- Account deletion + export.

## Milestone 5 — Hardening & beta

- Sentry release health, dashboards for PRD §54 metrics (session failure rate, latency, cost/session), alerts, global spend breaker.
- Authorisation-matrix tests, Playwright E2E (web), Maestro flow (mobile smoke test).
- Deploy: web → Vercel; api + worker → Railway/Fly; managed Postgres/Redis; EAS build → Play internal testing track.
- Privacy policy / consent copy finalised (DPDP).

**Exit = PRD §83 acceptance criteria 1–20 all demonstrably met.**

---

## Post-MVP backlog (ordered by expected value)

1. Retry mode targeting previous weakness (§38)
2. Surprise mode (§39) and challenge missions (§40)
3. Push notifications (FCM) with user controls (§57)
4. Subscriptions (Play Billing / Razorpay) + entitlements
5. Pronunciation + shadowing (`PronunciationProvider`, needs audio retention)
6. More scenarios (§15), which are content work only thanks to DB-driven design
7. Phone-call mode via SIP/telephony provider (§21)
8. Gamification (§58), corporate tier (§81)

---

## Definition of done (every PR)

- `pnpm lint && pnpm typecheck && pnpm test` pass locally and in CI.
- No `any` without an `// eslint-disable-next-line` and a justification.
- New external input is validated with Zod.
- Critical-path changes (auth, ownership, lifecycle, quota, analysis) include tests.
- Docs are updated if a decision in `/docs` changed.
