/**
 * Live call spike (VOICE-ARCHITECTURE §10, S1 + parts of S2/S3) with a headless "phone".
 *
 * A werift WebRTC peer plays the phone: it streams a continuous mic signal (quiet noise floor
 * plus synthesized speech) and receives the AI's audio, through our API, to the real provider.
 *
 *   1. AI greets first                        → first-audio time
 *   2. "phone" says a sentence with mistakes  → response latency, verbatim transcript check
 *   3. "phone" interrupts the AI mid-reply    → barge-in stop latency
 *
 *   node dist/main.js                      # API running (apps/api/.env)
 *   node scripts/spike-call.ts [female|male]
 *
 * Test utterances are synthesized once with Gemini TTS and cached in logs/spike-audio/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import OpusScript from 'opusscript';
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from 'werift';

const root = join(import.meta.dirname, '..');
const env = { ...process.env, ...parseEnv(readFileSync(join(root, '.env'), 'utf8')) };
const API = env.SPIKE_API_URL ?? `http://127.0.0.1:${env.PORT ?? 4810}/v1`;
const TOKEN = env.POC_DEV_TOKEN ?? '';
const voice = process.argv[2] === 'male' ? 'male' : 'female';

const UTTERANCES = {
  answer: 'Um, it was good. Yesterday I go to a trek with my friends, and uh, I am agree it was very tiring but fun.',
  bargeIn: 'Wait, wait, sorry, one question. What is your favourite movie?',
};

const RATE = 24000; // TTS output rate; Opus packets are sample-rate agnostic on decode
const FRAME = RATE / 50; // 20 ms
const t0 = performance.now();
const now = () => performance.now() - t0;
const log = (msg: string) => console.log(`${String(Math.round(now())).padStart(6)} ms  ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tts(text: string, file: string): Promise<Buffer> {
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Only the words to speak: style instructions in the text get read out loud by the TTS model.
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
      },
    }),
  });
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> };
  const data = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!res.ok || !data) throw new Error(`TTS failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  const pcm = Buffer.from(data, 'base64');
  writeFileSync(file, pcm);
  return pcm;
}

async function api(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  const audioDir = join(root, 'logs', 'spike-audio');
  mkdirSync(audioDir, { recursive: true });
  const answerPcm = await tts(UTTERANCES.answer, join(audioDir, 'answer.pcm'));
  const bargePcm = await tts(UTTERANCES.bargeIn, join(audioDir, 'barge-in.pcm'));
  log(`test audio ready: answer ${(answerPcm.length / 2 / RATE).toFixed(1)} s, barge-in ${(bargePcm.length / 2 / RATE).toFixed(1)} s`);

  // ── "phone" peer ──
  const pc = new RTCPeerConnection({
    codecs: { audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2 })], video: [] },
  });
  const mic = new MediaStreamTrack({ kind: 'audio' });
  const transceiver = pc.addTransceiver(mic, { direction: 'sendrecv' });
  const dc = pc.createDataChannel('oai-events');

  // AI audio activity, detected from received RTP (what the phone would actually play).
  let lastAiRtp = -1;
  let aiRtpCount = 0;
  const aiSpeaking = () => lastAiRtp > 0 && now() - lastAiRtp < 150;
  const waitFor = async (cond: () => boolean, timeoutMs: number, label: string) => {
    const start = now();
    while (!cond()) {
      if (now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
      await sleep(10);
    }
    return now();
  };
  pc.onTrack.subscribe((track) =>
    track.onReceiveRtp.subscribe((rtp) => {
      if (rtp.payload.length > 3) {
        lastAiRtp = now();
        aiRtpCount++;
      }
    }),
  );
  const floors: string[] = [];
  dc.onMessage.subscribe((m) => {
    const e = JSON.parse(m.toString()) as { type: string; floor?: string };
    if (e.type === 'floor') floors.push(`${Math.round(now())}:${e.floor}`);
  });

  // Continuous mic: speech when queued, otherwise a quiet noise floor — like a real phone.
  const encoder = new OpusScript(RATE, 1, OpusScript.Application.VOIP);
  let speech: Buffer | null = null;
  let speechOffset = 0;
  let seq = 0;
  let ts = 0;
  const say = (pcm: Buffer) => {
    speech = pcm;
    speechOffset = 0;
    return new Promise<number>((resolve) => {
      const check = setInterval(() => {
        if (speech === null) {
          clearInterval(check);
          resolve(now());
        }
      }, 5);
    });
  };
  const micTimer = setInterval(() => {
    let frame: Buffer;
    if (speech && speechOffset < speech.length) {
      frame = Buffer.alloc(FRAME * 2);
      speech.copy(frame, 0, speechOffset, speechOffset + FRAME * 2);
      speechOffset += FRAME * 2;
      if (speechOffset >= speech.length) speech = null;
    } else {
      frame = Buffer.alloc(FRAME * 2);
      for (let i = 0; i < FRAME; i++) frame.writeInt16LE(Math.round((Math.random() - 0.5) * 60), i * 2);
    }
    const opus = encoder.encode(frame, FRAME);
    ts = (ts + 960) >>> 0;
    const header = new RtpHeader({ payloadType: 111, sequenceNumber: (seq = (seq + 1) & 0xffff), timestamp: ts });
    void transceiver.sender.sendRtp(new RtpPacket(header, opus)).catch(() => undefined);
  }, 20);

  // ── connect through our API ──
  let callId = '';
  const dcOpen = new Promise<void>((r) => dc.stateChanged.subscribe((s) => s === 'open' && r()));
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise<void>((r) => {
    if (pc.iceGatheringState === 'complete') return r();
    pc.iceGatheringStateChange.subscribe((s) => s === 'complete' && r());
  });
  const tConnect = now();
  const connected = (await api('/poc/connect', { sdpOffer: pc.localDescription!.sdp, voice })) as { callId: string; sdpAnswer: string };
  callId = connected.callId;
  log(`connected ${callId} (connect took ${Math.round(now() - tConnect)} ms)`);
  await pc.setRemoteDescription({ type: 'answer', sdp: connected.sdpAnswer });
  await dcOpen;
  const tReady = now();
  await api(`/poc/calls/${callId}/ready`);
  log('media up → /ready');

  const results: Record<string, string> = {};
  try {
    // 1) AI speaks first
    const tGreet = await waitFor(aiSpeaking, 15_000, 'AI greeting');
    results['greeting first audio (after /ready)'] = `${Math.round(tGreet - tReady)} ms`;
    log('AI greeting started');
    await waitFor(() => lastAiRtp > 0 && now() - lastAiRtp > 1200, 30_000, 'greeting end');
    log('AI greeting finished');

    // 2) user answers with mistakes/fillers
    await sleep(400);
    log('phone says: answer');
    const tAnswerEnd = await say(answerPcm);
    const tReply = await waitFor(aiSpeaking, 15_000, 'AI reply');
    results['response latency (end of user speech → AI audio at phone)'] = `${Math.round(tReply - tAnswerEnd)} ms`;
    log('AI reply started');

    // 3) barge-in after ~1.5 s of AI speech
    await sleep(1500);
    if (aiSpeaking()) {
      log('phone interrupts');
      const tBarge = now();
      void say(bargePcm);
      const tStop = await waitFor(() => !aiSpeaking(), 10_000, 'AI to stop (barge-in)');
      results['barge-in: user starts → AI audio stops'] = `${Math.round(tStop - tBarge - 150)} ms (±20)`;
      log('AI stopped');
      await waitFor(() => speech === null, 10_000, 'barge-in utterance to finish');
      await waitFor(aiSpeaking, 15_000, 'AI answer to interruption');
      log('AI answering the interruption');
      await waitFor(() => lastAiRtp > 0 && now() - lastAiRtp > 1200, 30_000, 'answer end');
    } else {
      results['barge-in'] = 'skipped (AI reply was shorter than 1.5 s)';
    }
  } catch (err) {
    log(`STOPPED: ${(err as Error).message}`);
  }

  clearInterval(micTimer);
  const ended = (await api(`/poc/calls/${callId}/end`)) as {
    endReason: string;
    durationMs: number;
    turns: Array<{ speaker: string; text: string; interrupted: boolean }>;
  };
  await pc.close();
  encoder.delete();

  console.log('\n── Results ─────────────────────────────────────');
  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(58)} ${v}`);
  console.log(`${'AI audio packets received'.padEnd(58)} ${aiRtpCount}`);
  console.log(`${'floor events (UI indicator)'.padEnd(58)} ${floors.join(' ')}`);
  console.log(`\nTranscript (${ended.endReason}, ${(ended.durationMs / 1000).toFixed(1)} s):`);
  for (const t of ended.turns) console.log(`  ${t.speaker.padEnd(4)} ${t.text}${t.interrupted ? '  [interrupted]' : ''}`);
  console.log(`\nSpoken by the "phone" (for comparison):\n  ANSWER  ${UTTERANCES.answer}\n  BARGE   ${UTTERANCES.bargeIn}`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
