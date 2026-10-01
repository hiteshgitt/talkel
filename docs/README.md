# Talkel — Documentation Index

> Working name. The architecture is independent of the brand (PRD §89).

**Status:** architecture approved (2026-09-29). Milestone 0 (voice POC on Gemini Live) is proven on a real phone. **Milestone 1 (foundation) is done (2026-09-30).** Milestone 2 is next.

## Decisions confirmed by the product owner

| Topic | Decision |
|---|---|
| Auth | Better Auth (email/password + Google) |
| Free tier | 10 minutes of conversation per day (`FREE_DAILY_SECONDS=600`) |
| Feedback languages (MVP) | English + Hindi |
| Mobile toolchain | Expo (development builds via EAS) |
| Market | India first, and the design must not block other regions later |
| Provider keys | OpenAI and any other API keys will be requested when a milestone needs them |
| Realtime voice provider (M0) | **Gemini Live** for now: the OpenAI account has no credits (2026-09-29). OpenAI mode stays in the code behind `REALTIME_PROVIDER=openai`. See VOICE-ARCHITECTURE §3a. |

| Doc | What it answers |
|---|---|
| [PRD.md](PRD.md) | The product requirements (verbatim) plus proposed engineering amendments |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System components, monorepo layout, tech decisions, external services, env vars |
| [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md) | **Highest risk.** How the live call works: WebRTC media + server sideband control, turn-taking, reconnection, transcripts, spikes |
| [AI-ARCHITECTURE.md](AI-ARCHITECTURE.md) | Provider interfaces, prompt layering, Conversation Engine, evaluation pipeline |
| [DATABASE.md](DATABASE.md) | Prisma schema draft for MVP, conventions, deferred tables |
| [API.md](API.md) | REST endpoints, realtime control-channel protocol, error model |
| [SECURITY.md](SECURITY.md) | Threat model, controls, privacy & retention, DPDP notes |
| [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md) | Milestone 0 voice POC gate → M1–M5 → post-MVP backlog |

## The architecture in one paragraph

The Android app streams microphone audio **directly** to the realtime voice model over WebRTC for the lowest possible latency. The NestJS backend is not in the audio path, but it stays **in charge**. It proxies the WebRTC handshake (so no AI key ever reaches the phone) and attaches its own "sideband" control connection to the same AI session. Through that connection it sets the character's instructions, runs timers and end conditions, handles tool calls and saves every transcript turn as it happens. When the call ends, a background worker runs a *separate* evaluation model over the transcript. The worker computes objective metrics (fillers, pace, pauses) in code, validates the LLM's judgments with Zod and drops any correction that isn't grounded in what the user actually said.

## Risks that could change the plan

1. **Natural feel** (latency, echo on speakerphone, pause tolerance) is unproven until Milestone 0.
2. **Transcript fidelity**: ASR may "fix" the user's grammar and drop fillers, which would undermine the feedback.
3. **Cost per session**: realtime audio is expensive, and free-tier limits depend on the measured cost.
4. **Android background audio** (foreground-service rules on Android 14+).
5. **Provider dependency**: single realtime vendor for MVP. The abstraction limits the blast radius but doesn't remove it.

## Local development (after M0/M1 scaffolding)

Requires Node.js 22/24 LTS, pnpm 10, Docker, an Android device with USB debugging, and an Expo/EAS account. The steps will be filled in once scaffolding exists.
