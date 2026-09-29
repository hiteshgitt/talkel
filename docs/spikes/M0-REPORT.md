# Milestone 0 — Spike Report (in progress)

**Provider:** Gemini Live (`gemini-3.8-live`) through our WebRTC voice gateway, `REALTIME_PROVIDER=gemini`. See VOICE-ARCHITECTURE §3a.
**Status:** server-side loop proven with a headless phone. **The physical-phone test is still pending** (needs the EAS dev build).

## How it was measured

`apps/api/scripts/spike-call.ts` runs a headless WebRTC "phone" (werift) against the real Gemini API through our API, on the same machine:
- The mic is continuous: a quiet noise floor, plus speech synthesized with Gemini TTS.
- AI audio is timed at the moment its RTP packets reach the "phone".
- Device audio buffers and real network paths are **not** included. On a real phone expect roughly +100–250 ms.

Test utterances:
- **Answer:** "Um, it was good. Yesterday I go to a trek with my friends, and uh, I am agree it was very tiring but fun."
- **Barge-in**, spoken about 1.5 s into the AI's reply: "Wait, wait, sorry, one question. What is your favourite movie?"

## Results (2026-09-29, two runs)

| Spike | Metric | Run 1 (female/Kore) | Run 2 (male/Puck) | Target | Verdict |
|---|---|---|---|---|---|
| S1 | Server-controlled call: connect, AI speaks first, transcripts, server hang-up | ✅ | ✅ | works | **PASS** |
| S1 | Connect (`/poc/connect`, Gemini setup + WebRTC answer in parallel) | 917 ms | — | — | OK |
| S1 | AI greeting audio after media ready | 1322 ms | 1396 ms | — | OK |
| S2 | Response latency (end of user speech → AI audio at phone) | **871 ms** | **1604 ms** | ≤ 1.2 s | ⚠️ borderline, variable |
| S2 | Barge-in: user starts talking → AI audio stops | **480 ms** | **535 ms** | < 300 ms | ⚠️ above target |
| S3 | Grammar errors preserved in the transcript ("I go to", "I am agree") | ✅ | ✅ | ≥ 85% | ✅ promising |
| S3 | Fillers preserved ("um", "uh") | "Um" kept, "uh" dropped | both dropped | ≥ 70% | ❌ not reliable |
| S3 | Word accuracy | "trek" → "track" | "trek" → "track" | — | note |
| — | Transcript order and `[interrupted]` marker on the barged-in AI turn | ✅ | ✅ | — | ✅ |

Token usage for one ~49 s call: 1,754 input audio, 2,711 input text (system prompt), 576 output audio tokens. The cost per 10 minutes (S5) will be computed once the Gemini Live pricing is confirmed for the account.

## What this means

1. **The architecture works** with Gemini: phone ⇄ our gateway ⇄ Gemini, with the server fully in control.
2. **Latency** includes a deliberate wait of about 800 ms of silence, so learners can pause to think (`END_SENSITIVITY_LOW`, `silenceDurationMs: 800`). This should become a per-difficulty setting: shorter for Advanced/Expert, longer for Beginner.
3. **Barge-in (~0.5 s)** is dominated by the provider detecting that the user started speaking. Because our server is in the media path, we can cut or duck AI audio **locally** as soon as our own speech detector fires (~60–100 ms), then confirm with the provider. Decide after the on-device test (S2).
4. **Fillers:** as predicted (VOICE-ARCHITECTURE §7), provider transcription drops them. Grammar errors do survive. To report fillers reliably, M3 should run a verbatim post-call transcription over retained session audio. Our gateway already has the user's PCM, so this needs **no extra work on the phone**, which is simpler than the OpenAI-mode fallback.

## Still to do

- [ ] S2 on a physical Android phone: earpiece, speaker (echo self-interruption) and headset; perceived latency
- [ ] S4: screen off / background for 10 min
- [ ] S5: cost per 10-minute session
- [ ] Network: phone on the same LAN as the server. For mobile data, add TURN or a public IP.
