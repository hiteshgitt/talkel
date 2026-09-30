# SpeakAI (working name)

AI English conversation coach: realistic voice conversations with AI characters, then personalised feedback.

- **Docs & architecture:** [docs/README.md](docs/README.md)
- **Status:** Milestone 1 (foundation: database, accounts, app shell) done. Next: Milestone 2 (scenarios, saved conversations, daily limit).

```text
apps/api            NestJS: auth (Better Auth), users, voice gateway (WebRTC ⇄ Gemini Live / OpenAI), admin
apps/mobile         Expo (Android-first) app — sign-in, onboarding, tabs, calls
apps/web            Next.js 16 — sign-in/up, password reset, dashboard, admin
packages/contracts  Zod schemas shared by api, mobile and web
packages/db         Prisma 7 schema, migrations and client (PostgreSQL)
scripts/            dev tooling
docs/               PRD, architecture, API, DB, security, plan, spike reports
```

## Local development

Requires Node 24 (`nvm use`), pnpm 10, Docker, and for the phone: an Android device on the same Wi-Fi and an Expo account.

```bash
nvm use && pnpm install
docker compose up -d                       # Postgres :5436, Redis :6381, Mailpit :1027 (UI http://localhost:8027)

cp packages/db/.env.example packages/db/.env
pnpm --filter @speakai/db migrate:deploy   # apply migrations

cp apps/api/.env.example apps/api/.env     # set BETTER_AUTH_SECRET (openssl rand -hex 32), GEMINI_API_KEY, your LAN IP
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

pnpm build                                 # contracts, db, api, web
pnpm --filter @speakai/db seed             # scenarios & personas
pnpm --filter @speakai/api start           # API  :4810
cd apps/api && node dist/worker.js && cd ../..  # queue worker (after-call feedback) — run alongside the API
pnpm --filter @speakai/web start           # Web  :3100  (dev: pnpm --filter @speakai/web dev)
cd apps/mobile && pnpm start               # Metro :8081 for the development build
```

Emails (verification, password reset) land in Mailpit at http://localhost:8027 in development.

Make someone an admin (there is intentionally no API for this):

```bash
cd apps/api && node scripts/make-admin.ts someone@example.com
```

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @speakai/api test:e2e        # needs docker compose (uses the speakai_test database)
```

CI (`.github/workflows/ci.yml`) runs the same on every push, plus a web production build and a secrets scan.
