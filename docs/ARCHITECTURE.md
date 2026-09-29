# System Architecture

**Status:** Proposed — pending approval. No application code will be written until this is approved.

Related: [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md) · [AI-ARCHITECTURE.md](AI-ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [API.md](API.md) · [SECURITY.md](SECURITY.md)

---

## 1. Principles

1. **The realtime call is the product.** Everything else is built around it and after it (PRD §87).
2. **Media direct, control on the server.** Audio never passes through our servers. Session authority always stays with the server.
3. **Hot path vs. cold path.** The live call uses no queues and no DB reads in the audio loop. Everything after "End call" goes through BullMQ.
4. **Database-driven content.** Scenarios, personas and prompts are versioned data, not code (PRD §74, §78).
5. **Provider-agnostic seams** at exactly two points: `RealtimeVoiceProvider` and `EvaluationProvider`.
6. **Contracts first.** Zod schemas in `packages/contracts` are the single source for API types, used by the API, web and mobile.

---

## 2. Component diagram

```text
                     ┌──────────────────────────┐        ┌───────────────────────┐
                     │  Android app (Expo dev   │        │  Web (Next.js 16)     │
                     │  build, RN, TS)          │        │  user dashboard +     │
                     │  expo-router · TanStack  │        │  /admin               │
                     │  Query · Zustand         │        │  (Vercel)             │
                     └───┬───────────┬──────────┘        └──────────┬────────────┘
             REST + WSS  │           │ WebRTC audio                  │ REST (cookie auth)
                         ▼           ▼                               ▼
┌────────────────────────────────────────────┐   ┌──────────────────────────────┐
│ apps/api — NestJS (HTTP + WS)              │◀═▶│ OpenAI Realtime              │
│  auth · users · scenarios · personas       │ ↑ │ (sideband control WS)        │
│  conversations · conversation-engine       │ │ └──────────────────────────────┘
│  realtime-gateway (app control WS)         │ │  sideband
│  usage/quota · admin · health              │─┘
└───────┬──────────────────────┬─────────────┘
        │ Prisma               │ BullMQ producer
        ▼                      ▼
┌──────────────┐        ┌──────────────┐     ┌──────────────────────────────────┐
│ PostgreSQL   │◀───────│ Redis        │────▶│ apps/api worker entrypoint       │
│ (source of   │        │ queues, rate │     │ analysis · learning-profile ·    │
│  truth)      │        │ limits, owner│     │ retention-cleanup · usage-rollup │
└──────────────┘        │ locks, pubsub│     │ → EvaluationProvider (OpenAI)    │
                        └──────────────┘     └──────────────────────────────────┘
        S3-compatible object storage (only if audio retention is enabled / Spike S3 fails)
        Sentry (api, worker, web, mobile) · structured JSON logs (pino)
```

---

## 3. Backend modules (NestJS)

| Module | Responsibility | Notes |
|---|---|---|
| `auth` | Better Auth mounted into Nest (email/password, Google). Guards: `AuthGuard`, `RolesGuard`. | Bearer tokens for mobile, httpOnly cookies for web |
| `users` | Profile, settings, account deletion | |
| `catalog` | Scenarios, scenario versions, personas, voices (read) | Cached in Redis, invalidated on admin publish |
| `conversations` | REST lifecycle, history, transcripts, deletion | Ownership enforced in the repository layer |
| `conversation-engine` | Instruction assembly, session state machine, timers, tool handlers, wrap-up/end logic | Pure domain logic, unit-test heavy |
| `realtime` | `RealtimeVoiceProvider` implementation (OpenAI): SDP proxy, sideband WS client, event normalisation | The only module that knows OpenAI event names |
| `realtime-gateway` | App control WebSocket to the device | |
| `usage` | Quotas, usage records, cost estimation | Checked on create/connect; enforced by timers |
| `analysis` (worker) | Evaluation pipeline, learning-profile update, recommendations | Queue: `analysis` |
| `admin` | CRUD + publish for scenarios/personas/prompts, users, usage views | `ADMIN` role only |
| `health` | Liveness/readiness, provider reachability | |

**Processes** (same codebase, same Docker image):

- `api`: HTTP + WS. It holds sideband sockets, so it is **stateful per call**. Deploy with graceful shutdown: new calls drain before exit, the max drain is 1 × max session length, or active calls end with `endReason=SERVER_RESTART` and are analysed as usual.
- `worker`: the BullMQ consumers. Scales independently.

---

## 4. Monorepo layout

```text
talkel/                         (repo root; working name SpeakAI)
├── apps/
│   ├── api/                    NestJS — src/main.ts (http) + src/worker.ts (queues)
│   ├── web/                    Next.js 16 App Router — (dashboard) + /admin
│   └── mobile/                 Expo (dev build) — expo-router
├── packages/
│   ├── contracts/              Zod schemas → API DTOs & shared TS types (web, mobile, api)
│   ├── db/                     Prisma schema, migrations, seed (5 MVP scenarios), client export
│   ├── ai/                     Provider interfaces, OpenAI impls, prompt assembly,
│   │                           evaluation schemas — SERVER-ONLY (lint-enforced)
│   ├── shared/                 Pure utils: time, ids, filler lexicon, text metrics
│   └── config/                 tsconfig bases, eslint config, prettier
├── docs/
├── scripts/                    dev bootstrap, db reset, spike tools (latency harness)
├── .github/workflows/          ci.yml (lint, typecheck, test, build)
├── docker-compose.yml          postgres + redis for local dev
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example                (no real values; each app has its own .env.example)
```

**Tooling:** pnpm workspaces + Turborepo (task graph and caching), TypeScript `strict` + `noUncheckedIndexedAccess`, ESLint (flat config) + Prettier, Vitest for packages/web/api unit tests, Jest-expo + React Native Testing Library for mobile, Playwright for web E2E, Supertest + Testcontainers (Postgres/Redis) for API integration tests.

**Expo in pnpm:** use `node-linker=hoisted` in `.npmrc` unless the Expo SDK version we pin fully supports isolated installs. We decide during Phase 1 scaffolding and document the choice.

**Runtime:** Node.js **24 LTS**, pinned via `.nvmrc` (already installed on the dev server through nvm; the shell default there is still 20).

---

## 5. Key technology decisions

| Area | Decision | Alternatives considered |
|---|---|---|
| Realtime voice | OpenAI Realtime (`gpt-realtime` family) over WebRTC + server sideband | Relay WS (latency); cascaded pipeline (rejected by PRD) |
| Evaluation LLM | OpenAI text model with Structured Outputs, validated again with Zod. Model is set by env var. | Same provider keeps MVP simple, and the interface allows swapping |
| Auth | **Better Auth** (decided), self-hosted in our Postgres, with an Expo client plugin | Clerk: faster setup, but per-MAU cost, user data held externally and extra JWT plumbing into NestJS |
| ORM | Prisma (`packages/db`) | — |
| Queue | BullMQ on Redis | — |
| Mobile state | TanStack Query (server state) + Zustand (call UI state machine) | — |
| Web styling | Tailwind CSS 4 + CSS Modules where needed; shadcn/ui for admin tables/forms | — |
| Hosting (proposal) | Web → **Vercel**. API + worker → **Railway or Fly.io** (long-lived sockets, one image, 2 processes). Postgres → Neon or Railway PG. Redis → Railway Redis or Upstash (BullMQ needs a non-serverless-limited plan). Objects → Cloudflare R2. | Everything on AWS/GCP: more control, much more ops for an MVP |
| Region | Place API/DB **close to the provider's realtime region** (US), not close to the user. Only the SDP exchange and control messages go user ⇄ API; media goes user ⇄ provider. **[SPIKE S2]** Measure from India. | Mumbai region: better for REST, worse for sideband |
| Observability | Sentry (all 4 runtimes), pino JSON logs with `sessionId`/`userId` correlation, OpenTelemetry metrics later | — |

---

## 6. External services required

| Service | Needed for | Phase |
|---|---|---|
| OpenAI API (Realtime + transcription + text) | Live conversation, transcripts, evaluation | M0 |
| Physical Android device(s) + Expo/EAS account | Dev builds (WebRTC cannot run in Expo Go) | M0 |
| PostgreSQL | Source of truth | M1 (local Docker) → hosted before beta |
| Redis | Queues, rate limiting, session ownership | M1 |
| Google Cloud OAuth client (web + Android) | Google sign-in | M1 |
| Transactional email (e.g. Resend / Postmark / SES) | Email verification, password reset | M1 |
| Sentry | Error tracking | M1 |
| Hosting: Vercel (web), Railway/Fly (api+worker) | Deployment | M5 |
| S3-compatible storage (Cloudflare R2) | Only if audio retention is on or S3 fails | Conditional |
| Firebase Cloud Messaging | Push notifications | Post-MVP |
| Google Play Console | Distribution. Note: in-app digital subscriptions fall under Play Billing policy. | Beta / post-MVP |
| Payments (Razorpay / Play Billing) | Subscriptions | Post-MVP |

---

## 7. Environment variables

Validated at boot with a Zod env schema per app. The process refuses to start if any are missing. Secrets are never committed. `.env*` is git-ignored except `.env.example`.

**apps/api (api + worker)**

| Var | Purpose |
|---|---|
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | Runtime |
| `APP_BASE_URL`, `WEB_BASE_URL`, `CORS_ORIGINS` | URLs / CORS allow-list |
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | Prisma (pooled / direct for migrations) |
| `REDIS_URL` | BullMQ, rate limits, locks |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ANDROID_CLIENT_ID` | Google sign-in |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` | Transactional email |
| `OPENAI_API_KEY`, `OPENAI_ORG_ID` (optional), `OPENAI_PROJECT_ID` (optional) | Provider |
| `REALTIME_MODEL`, `REALTIME_TRANSCRIBE_MODEL`, `EVAL_MODEL` | Model selection without code change |
| `MAX_SESSION_SECONDS`, `FREE_DAILY_SECONDS`, `CONNECT_TTL_SECONDS` | Cost guards |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Optional audio retention |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `RELEASE` | Monitoring |

**apps/web:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build only)

**apps/mobile** (these are public and get embedded in the app): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. **Never put a provider key in the mobile app.**

---

## 8. Architectural decision log (ADR summary)

| ADR | Decision | Status |
|---|---|---|
| 001 | Monorepo with pnpm + Turborepo | Proposed |
| 002 | Media direct via WebRTC, control via server sideband | Proposed, gated on S1 |
| 003 | Split `RealtimeVoiceProvider` / `EvaluationProvider` | Proposed |
| 004 | Scenarios, personas and prompts are immutable published versions; sessions pin versions | Proposed |
| 005 | Deterministic metrics in code; LLM for judgment only; banded scores with rationale | Proposed |
| 006 | Worker is a second entrypoint of `apps/api` | Proposed |
| 007 | Audio not retained by default | Proposed, gated on S3 |
| 008 | Better Auth over Clerk | **Accepted** (2026-09-29) |

Full ADRs go in `docs/adr/NNN-*.md` once approved.
