# Milestone 0 — Voice POC Runbook

This covers how to run the POC on a real Android phone and collect the numbers for the go/no-go report (`docs/spikes/M0-REPORT.md`, written after testing).

## What's built

| Piece | Where | Status |
|---|---|---|
| Shared API contracts (Zod) | `packages/contracts` | ✅ built |
| API, **Gemini mode (default)**: WebRTC voice gateway ⇄ Gemini Live, AI-speaks-first, barge-in, wrap-up + hard stop, transcript, per-call JSONL log | `apps/api` | ✅ unit tests + **live call against real Gemini passed** (see M0-REPORT) |
| API, OpenAI mode: SDP proxy + sideband | `apps/api` | ✅ unit + e2e against a fake OpenAI (live run blocked: account has no credits) |
| Android app: setup → call screen (mute, speaker, timer, speaking/listening ring) → transcript | `apps/mobile` | ✅ typecheck, lint, expo-doctor, Android JS bundle. ⏳ Not yet run on a device |
| Headless live call test (latency, barge-in, transcript) | `apps/api/scripts/spike-call.ts` | ✅ |
| Call report from JSONL logs | `scripts/call-report.ts` | OpenAI-mode logs only |

## What you need

1. **Provider key** in `apps/api/.env`: `GEMINI_API_KEY` (default mode), or `OPENAI_API_KEY` with `REALTIME_PROVIDER=openai`
2. **Expo account** (free) → for `eas build` of the development build
3. **Android phone** (Android 10+), ideally also one low-to-mid-range device
4. **Network.** In Gemini mode the phone's **audio goes to this server** over WebRTC (UDP), so:
   - **same Wi-Fi/LAN as the server** (simplest): `EXPO_PUBLIC_API_URL=http://<server-lan-ip>:4810/v1` (dev builds allow HTTP)
   - on mobile data, the server needs a public IP or a TURN server (`RTC_ICE_SERVERS`). An HTTP tunnel alone is not enough, because it only carries signalling.

## Run it

```bash
nvm use                       # Node 24
pnpm install
pnpm build                    # contracts + api

# API
cp apps/api/.env.example apps/api/.env
#   set GEMINI_API_KEY and POC_DEV_TOKEN (openssl rand -hex 24)
pnpm --filter @speakai/api start       # or: dev (watch mode)

# Optional: headless live call against the real provider (no phone needed)
cd apps/api && node scripts/spike-call.ts female && cd ../..

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

After each call, the per-call event log is at `apps/api/logs/calls/<callId>.jsonl`, and the API log line on call end shows the turn count and token usage. `scripts/call-report.ts` currently parses OpenAI-mode logs only. Record your perceived latency, any echo self-interruptions and the transcript accuracy in `M0-REPORT.md`.

## Known limitations of this POC (by design)

- There is no login. A static dev token gates the API, and anyone who has the dev build and token can make calls. Don't distribute the APK.
- No database. Transcripts live in API memory (last 50 calls) and in the JSONL logs.
- Max 3 simultaneous calls and 5 min per call, enforced by the server.
- No reconnection yet. A dropped connection ends the call (M2 adds reconnection).
- No background/foreground service. Locking the screen may cut the mic (Spike S4).

## Library risks to watch on device

- **`@livekit/react-native-webrtc`** was chosen over `react-native-webrtc` because React Native Directory confirms it supports the New Architecture (RN 0.86 is New-Architecture-only). Its API is the same fork.
- **`react-native-incall-manager`** (earpiece/speaker routing) is *not* confirmed on the New Architecture. It is a plain native module, so it should work through React Native's interop layer. If the Speaker button or earpiece routing misbehaves, the fallback is a small local Expo module using Android `AudioManager`, which is also where the S4 foreground service will live.
