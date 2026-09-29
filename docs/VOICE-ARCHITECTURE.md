# Voice Architecture

**Status:** Proposed. Items marked **[SPIKE]** must be confirmed in Milestone 0 before we build on them.
**Scope:** How live audio moves between the Android app and the realtime AI, and how the backend stays authoritative without sitting in the audio path.

---

## 1. Design goals (priority order)

1. **Perceived latency.** The AI should start answering within about 1 s of the user finishing (p50), and barge-in should stop AI audio in under 300 ms.
2. **Natural turn-taking.** The user can interrupt. The AI does not interrupt itself because of speaker echo, and it does not cut the user off during thinking pauses.
3. **Server-authoritative session.** The backend owns instructions, timers, end conditions, tool calls, transcript persistence and cost limits. The client is never trusted with any of these.
4. **Never lose a session** (PRD §70). Transcript turns are persisted as they happen, not at the end.
5. **No provider secret on the device.**

---

## 2. Options considered

| Option | Audio path | Latency | Server control | Verdict |
|---|---|---|---|---|
| **A. Relay**: device ⇄ our WS server ⇄ provider WS | Via our backend | +1 network hop each way, plus jitter we have to manage ourselves (no WebRTC jitter buffer or AEC on the WS leg) | Full | ❌ Latency and complexity. We would be rebuilding what WebRTC already does. |
| **B. Direct WebRTC, client-controlled** (ephemeral key, client sends all events) | Device ⇄ provider | Best | None. The client could change instructions, run forever or drop transcripts | ❌ Violates PRD §12 and cost control. |
| **C. Direct WebRTC media + server sideband control** | Device ⇄ provider | Best | Full, over a parallel server WebSocket attached to the same provider session | ✅ **Chosen** |
| D. Cascaded STT → LLM → TTS | Via backend | Worst | Full | ❌ Explicitly rejected by PRD §10 |

---

## 3. Chosen topology

```text
┌──────────────────────┐        (1) REST: create session, quota check
│   Android app        │ ─────────────────────────────────────────────┐
│  react-native-webrtc │        (2) REST: SDP offer  ───────────────┐ │
│                      │ ◀──────(2') SDP answer ─────────────────┐ │ │
│  mic ─▶ audio track  │                                          │ │ │
│  speaker ◀─ track    │        (5) WSS app-control channel ◀──┐ │ │ │
└─────────┬────────────┘            (warnings, end, heartbeat)│ │ │ │
          │                                                    │ │ ▼ ▼
          │ (3) WebRTC: Opus audio both ways            ┌──────┴─┴───────────┐
          │     + data channel ("oai-events")           │  apps/api (NestJS) │
          │                                             │  Conversation      │
          ▼                                             │  Engine            │
┌──────────────────────┐   (4) Sideband WebSocket       │                    │
│  OpenAI Realtime     │ ◀══════════════════════════════│  - session.update  │
│  (gpt-realtime)      │ ══════════════════════════════▶│  - tool calls      │
│                      │   server events: transcripts,  │  - timers / end    │
│  VAD · ASR · LLM ·   │   VAD, usage, errors           │  - persist turns   │
│  TTS in one model    │                                └─────────┬──────────┘
└──────────────────────┘                                          │
                                                        Postgres · Redis/BullMQ
```

### Step by step

1. **Create.** `POST /conversations` → the API validates entitlement and quota, resolves the scenario version, persona, difficulty and learning profile, assembles instructions (see [AI-ARCHITECTURE.md](AI-ARCHITECTURE.md)) and stores a `ConversationSession` in `CREATED` status. The instructions are held server-side and never sent to the client.
2. **Connect (SDP proxy).** The device creates an `RTCPeerConnection` with its mic track and a data channel, then `POST /conversations/:id/connect` with its SDP offer. The API forwards the offer **and the session config** (instructions, voice, VAD, transcription, tools) to the provider's WebRTC call-creation endpoint using the **server API key**. It returns the SDP answer to the device and keeps the provider `call_id`. **[SPIKE S1]** Confirm OpenAI's "unified" call-creation interface (server posts SDP + session config, gets `call_id`) works as documented.
   - *Why proxy the SDP and not issue an ephemeral key?* The device never holds any provider credential. The server learns `call_id` authoritatively, and the session config cannot be tampered with. The cost is one extra hop for the SDP exchange only (tens of ms, once). Media is unaffected.
   - *Fallback:* the API mints a short-lived ephemeral client secret with the session config pre-bound, and the device posts SDP to the provider directly. The device then reports `call_id` to the API.
3. **Media.** Opus audio flows device ⇄ provider directly over WebRTC. We get Android's hardware/WebRTC echo cancellation, noise suppression, jitter buffering and packet-loss concealment for free.
4. **Sideband control.** Immediately after (2), the API opens a server-side WebSocket to the same provider session (`call_id`). From then on the server:
   - sends `session.update` (instructions, difficulty adjustments, wrap-up nudges),
   - triggers the AI's opening line (`response.create`) so **the AI speaks first**,
   - receives transcripts, VAD events, tool calls, `response.done` usage and errors,
   - can hang up the call. **[SPIKE S1]** Confirm the sideband receives the full server-event stream and can hang up.
5. **App control channel.** The device also holds a lightweight WSS connection to our API (NestJS gateway) for things only our backend knows: "1 minute left", "session ending", "ended (reason)", "reconnecting". The device sends heartbeats and playback markers the other way. We do **not** use the provider data channel for app semantics, so the client stays provider-agnostic.

The sideband WebSocket is stateful and lives for the whole call. It is held by one API instance, which is the "session owner". Redis stores `session:{id}:owner = instanceId` with a TTL so other instances can route `end` requests to the owner through Redis pub/sub.

---

## 4. Turn-taking & interruption

| Concern | Approach |
|---|---|
| End-of-turn detection | Provider **semantic VAD** (the model decides when the user has finished a thought) rather than pure silence VAD, with eagerness tuned per difficulty: `low` for Beginner so thinking pauses are tolerated, `auto`/`high` for Advanced+. **[SPIKE S2]** Tune on real Indian-English speakers. |
| Barge-in | The provider cancels the in-flight response on `speech_started`. Over WebRTC the provider also truncates the AI item to what was actually played, so the model's memory matches what the user heard. The server logs an `INTERRUPTION` event with the offset. |
| Echo self-interruption (speakerphone) | Largest UX risk. Mitigations, in order: WebRTC AEC (on by default) → `VOICE_COMMUNICATION` audio mode via `react-native-incall-manager` → provider noise reduction set to `far_field` on speaker and `near_field` on headset/earpiece → default to **earpiece** (phone-call posture) with a speaker toggle. **[SPIKE S2]** Test on at least 3 low-to-mid-range Android devices. |
| AI interrupting the user (Upper-Int+, PRD §17) | Not a VAD feature. It is done by instructions ("occasionally cut in when the user rambles") at Advanced+ only. It is deferred past MVP unless S2 shows it can be done safely. |
| "Sorry, could you say that again?" (§19) | Behaviour set by instructions. The ASR confidence signal is not exposed, so we rely on the model. |

---

## 5. Session lifecycle (server state machine)

```text
CREATED ──connect──▶ CONNECTING ──sideband ok + first audio──▶ ACTIVE
   │                     │                                        │
   │ (TTL 2 min)         │ fail                                   ├─ user ends ─────────┐
   ▼                     ▼                                        ├─ time limit ────────┤
 EXPIRED              FAILED                                      ├─ end_conversation ──┤ (tool)
                                                                  ├─ heartbeat lost ────┤ (45 s)
                                                                  ├─ quota exhausted ───┤
                                                                  └─ media/sideband drop┐│
                                                                           ▼             ▼
                                                                    RECONNECTING ──▶ ENDED ──▶ enqueue analysis
                                                                     (≤ 2 tries,       (endReason set)
                                                                      ≤ 20 s total)
```

- **Timers are server-side.** At `planned − 60 s` the server sends a `session.update` nudge: "begin wrapping up naturally within the next minute". At `planned + 30 s` grace it hangs up regardless.
- **Hard cap:** `min(plannedDuration + 30 s, plan limit, MAX_SESSION_SECONDS)`, enforced by the server even if the client disappears. This is the cost-control backstop.
- **Heartbeat:** the device sends a heartbeat every 15 s on the control channel. After 45 s of silence the server ends the call, so we never pay for audio into an abandoned phone.

---

## 6. Reconnection (PRD §70)

A realtime provider session **cannot be resumed** once its transport dies, so reconnection means starting a new provider call inside the same `ConversationSession`:

1. The device detects ICE `failed`/`disconnected` for more than 3 s, or the server detects sideband loss. The UI shows "Connection lost. Reconnecting…".
2. The device calls `POST /conversations/:id/connect` again with a new SDP offer.
3. The server builds the instructions again and **seeds the new provider call with the persisted transcript**: the last N turns go in as conversation items, and a compact summary replaces older ones. It then instructs the AI to acknowledge the interruption naturally ("Sorry, I think we got cut off — you were saying…").
4. Each provider call is a `ConversationConnection` row, so usage and cost stay correct.
5. After 2 failed attempts or 20 s: `ENDED` with `endReason = CONNECTION_LOST`. The transcript so far is analysed, and the user sees "Your conversation could not continue. Your session has been saved."

---

## 7. Transcripts — the hidden accuracy problem

The analysis pipeline is only as good as the **user transcript**, and there are two known pitfalls:

1. **Normalisation.** Modern ASR models tend to *clean up* speech. They drop "um/uh", fix "I am agree", add missing articles. That would silently erase the very errors PRD §29 and §31 want to report.
2. **Two different "hearings".** The realtime model processes the audio natively. The *transcript* we receive comes from a separate ASR pass that runs alongside it. The two can disagree.

**Plan:**

| Stage | Approach |
|---|---|
| MVP default | Enable provider input transcription with a verbatim-style prompt ("Transcribe exactly as spoken, including fillers (um, uh), repetitions, false starts and grammatical errors. Do not correct.") using the most accurate available transcription model. |
| **[SPIKE S3]** | A scripted test set: 30 utterances with known errors and fillers, spoken by 3–5 speakers. Measure the recall of errors and fillers in the transcript. **Pass bar:** ≥ 85% of grammar errors and ≥ 70% of fillers preserved. |
| If S3 fails | Retain the user's audio for the session only (encrypted object storage, deleted after analysis) and run a separate verbatim transcription in the worker. This needs audio capture. Because media is direct device ⇄ provider, the device records a parallel local copy of the mic stream and uploads it after the call. This is a meaningful extra piece of work, which is why S3 runs first. |

Every user turn stores `transcriptSource` (`REALTIME_ASR` | `POST_ASR`) so the analysis knows which transcript it is using.

---

## 8. Timing metrics captured (for PRD §32)

The server stamps every provider event with a monotonic offset from `startedAt`:

| Metric | Derived from |
|---|---|
| User speech segments | `input_audio_buffer.speech_started` / `speech_stopped` |
| AI response latency (system) | `speech_stopped` → first `response.output_audio.delta` |
| **User response latency** | AI audio *playback end* (sent by the device on the control channel, because the server only knows generation end) → next `speech_started` |
| Interruptions | `speech_started` while a response is in progress |
| Speaking time | Sum of user speech segments |

Mouth-to-ear latency as the user experiences it can only be measured on the device. In Milestone 0 we measure it by recording both sides externally.

---

## 9. Android client specifics

| Concern | Choice |
|---|---|
| WebRTC | `@livekit/react-native-webrtc`, a maintained fork of `react-native-webrtc` with the same API. It was chosen because React Native Directory confirms New Architecture support, which RN 0.86 / Expo SDK 57 require, and the upstream package is unconfirmed. Permissions are declared in `app.json`, with no plugin. **This requires an Expo development build (EAS). Expo Go will not work.** |
| Audio routing (earpiece / speaker / Bluetooth / wired), proximity sensor | `react-native-incall-manager` for M0. It is **not confirmed on the New Architecture** (it runs through the interop layer). Fallback: a local Expo module on `AudioManager`, shared with the S4 foreground service. |
| Screen off / app backgrounded mid-call | On Android 14+, a foreground service with `foregroundServiceType="microphone"` plus an ongoing "call in progress" notification. Without it Android will kill mic access in the background. **[SPIKE S4]** Pick a library or write a small Expo module. |
| Audio focus (incoming phone call, other apps) | Pause: mute the mic track and send `response.cancel` via the server. On a real phone call, end the session gracefully. |
| Permissions | `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH_CONNECT` (Android 12+), `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS` |
| Network | Provider WebRTC handles ICE/TURN. We test on 4G with 150–300 ms RTT to the provider region, because most users are likely in India and provider media servers may be far away. **[SPIKE S2]** |

Phone-call mode (PRD §21) fits this design later: a telephony provider connects to the same realtime provider over SIP, and the sideband controller stays identical. That is the value of keeping control on the server.

---

## 10. Milestone 0 spike checklist

| ID | Question | Exit criterion |
|---|---|---|
| S1 | Does SDP-proxy + sideband work end to end (config applied, AI speaks first, server gets transcripts/usage, server can hang up)? | Demo on a physical Android device |
| S2 | Does it *feel* like a phone call? | p50 mouth-to-ear ≤ 1.2 s on Wi-Fi and ≤ 1.6 s on 4G. Barge-in works on earpiece and headset. Speakerphone self-interruptions < 1 per 5 min. |
| S3 | Is the transcript verbatim enough for grammar and filler feedback? | Recall bars in §7 |
| S4 | Does the call survive screen-off / backgrounding for 10 min? | No mic loss |
| S5 | What is the real cost per 10-minute session? | Measured from `response.done` usage × current pricing; feeds the free-tier quota decision |
