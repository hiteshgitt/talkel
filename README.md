# SpeakAI (working name)

AI English conversation coach: realistic voice conversations with AI characters, then personalised feedback.

- **Docs & architecture:** [docs/README.md](docs/README.md)
- **Current milestone:** M0 voice POC. See [docs/spikes/M0-RUNBOOK.md](docs/spikes/M0-RUNBOOK.md)

```text
apps/api          NestJS: realtime call control (SDP proxy + OpenAI sideband), REST
apps/mobile       Expo (Android-first) app
packages/contracts  Zod schemas shared by api and mobile
scripts/          dev tooling (call-report.ts)
docs/             PRD, architecture, API, DB, security, plan
```

```bash
nvm use && pnpm install
pnpm build && pnpm typecheck && pnpm test
pnpm --filter @speakai/api test:e2e
```
