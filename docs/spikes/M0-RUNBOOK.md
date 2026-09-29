# Milestone 0 — Voice POC Runbook

This covers how to run the POC on a real Android phone and collect the numbers for the go/no-go report (`docs/spikes/M0-REPORT.md`, written after testing).

## What's built

| Piece | Where | Status |
|---|---|---|
| Shared API contracts (Zod) | `packages/contracts` | ✅ built |
| API: SDP proxy, sideband control, AI-speaks-first, wrap-up + hard stop, transcript, per-call JSONL log | `apps/api` | ✅ 28 unit + 5 e2e tests (e2e uses a fake OpenAI server) |
| Android app: setup → call screen (mute, speaker, timer, speaking/listening ring) → transcript | `apps/mobile` | ✅ typecheck, lint, expo-doctor, Android JS bundle. ⏳ Not yet run on a device |
| Call report (latency, turns, tokens) | `scripts/call-report.ts` | ✅ |

Not tested yet, because a real key and a device are needed: a live OpenAI call and actual audio on a phone.

## What you need

1. **OpenAI API key** with Realtime access → `apps/api/.env`
2. **Expo account** (free) → for `eas build` of the development build
3. **Android phone** (Android 10+), ideally also one low-to-mid-range device
4. The phone must reach the API over the network (only signalling goes there; audio goes straight to OpenAI). Use one of:
   - the same LAN as the server: `http://<server-lan-ip>:4000/v1` (dev builds allow HTTP), or
   - an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:4000`) if the phone is on mobile data (recommended for the 4G latency test).

## Run it

```bash
nvm use                       # Node 24
pnpm install
pnpm build                    # contracts + api

# API
cp apps/api/.env.example apps/api/.env
#   set OPENAI_API_KEY and POC_DEV_TOKEN (openssl rand -hex 24)
pnpm --filter @speakai/api start       # or: dev (watch mode)

# Mobile — one-time development build (cloud build, installs as an APK)
cd apps/mobile
cp .env.example .env          # set EXPO_PUBLIC_API_URL and the same POC_DEV_TOKEN
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
#   install the APK from the link EAS prints, then:
pnpm start                    # Metro; open the SpeakAI dev app on the phone and connect
```

## Test script (what to try on each call)

1. Start "Friendly Conversation" with the female voice. **The AI should greet you first.**
2. Answer a few questions normally.
3. **Interrupt** the AI mid-sentence. It should stop within a moment and respond to what you said.
4. Pause for 3–5 s mid-thought ("I went to… um…"). **It should wait, not jump in.**
5. Try earpiece, then **Speaker**, then wired or Bluetooth headphones. Watch for the AI interrupting itself (echo).
6. Say a few sentences with deliberate mistakes and fillers: "Yesterday I go to office, um, and uh I am agree with my manager." Then check the transcript keeps them (Spike S3).
7. Lock the screen for 30 s mid-call (Spike S4; background survival is not handled yet, so this is expected to fail).
8. End the call and check that the transcript order and "(interrupted)" markers look right.

After each call:

```bash
node scripts/call-report.ts apps/api/logs/calls/<callId>.jsonl
```

Record system latency p50/p90, barge-ins, and token usage (for the cost-per-10-min estimate, S5).

## Known limitations of this POC (by design)

- There is no login. A static dev token gates the API, and anyone who has the dev build and token can make calls. Don't distribute the APK.
- No database. Transcripts live in API memory (last 50 calls) and in the JSONL logs.
- Max 3 simultaneous calls and 5 min per call, enforced by the server.
- No reconnection yet. A dropped connection ends the call (M2 adds reconnection).
- No background/foreground service. Locking the screen may cut the mic (Spike S4).

## Library risks to watch on device

- **`@livekit/react-native-webrtc`** was chosen over `react-native-webrtc` because React Native Directory confirms it supports the New Architecture (RN 0.86 is New-Architecture-only). Its API is the same fork.
- **`react-native-incall-manager`** (earpiece/speaker routing) is *not* confirmed on the New Architecture. It is a plain native module, so it should work through React Native's interop layer. If the Speaker button or earpiece routing misbehaves, the fallback is a small local Expo module using Android `AudioManager`, which is also where the S4 foreground service will live.
