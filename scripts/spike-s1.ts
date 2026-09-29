/**
 * Spike S1 (docs/VOICE-ARCHITECTURE.md §10): prove the SDP-proxy + sideband design against the
 * REAL OpenAI Realtime API, with a headless WebRTC peer standing in for the phone.
 *
 * Checks: our API proxies the SDP → media connects → data channel opens → server-triggered
 * AI greeting plays (RTP audio arrives) → sideband captures the AI transcript → server hangs up.
 * No user audio is sent, so this does not test barge-in or user transcription (that's on-device).
 *
 *   pnpm --filter @speakai/api start        # in another terminal (needs apps/api/.env)
 *   node scripts/spike-s1.ts [female|male]
 *
 * Costs a few cents of realtime usage per run.
 */
import { existsSync } from 'node:fs';
import { RTCPeerConnection, RTCRtpCodecParameters } from 'werift';

const envPath = new URL('../apps/api/.env', import.meta.url);
if (existsSync(envPath)) process.loadEnvFile(envPath);

const API = process.env.SPIKE_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4810}/v1`;
const TOKEN = process.env.POC_DEV_TOKEN ?? '';
const voice = process.argv[2] === 'male' ? 'male' : 'female';
const TIMEOUT_MS = 30_000;

const t0 = performance.now();
const at = () => `${String(Math.round(performance.now() - t0)).padStart(6)} ms`;
const log = (msg: string) => console.log(`${at()}  ${msg}`);

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
  const pc = new RTCPeerConnection({
    codecs: {
      audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2 })],
      video: [],
    },
  });
  pc.addTransceiver('audio', { direction: 'sendrecv' });
  const dc = pc.createDataChannel('oai-events');

  let rtpPackets = 0;
  let firstRtpAt: string | null = null;
  pc.onTrack.subscribe((track) => {
    log(`remote ${track.kind} track`);
    track.onReceiveRtp.subscribe((rtp) => {
      // OpenAI may send comfort-noise/DTX; count only packets with a real Opus payload.
      if (rtp.payload.length > 3) {
        rtpPackets++;
        firstRtpAt ??= at();
      }
    });
  });
  pc.connectionStateChange.subscribe((s) => log(`peer connection: ${s}`));

  const providerEvents: string[] = [];
  let aiDone!: () => void;
  const aiResponded = new Promise<void>((r) => (aiDone = r));
  dc.onMessage.subscribe((data) => {
    const type = (JSON.parse(data.toString()) as { type: string }).type;
    providerEvents.push(type);
    if (/output_audio_buffer\.(started|stopped)|response\.done|error/.test(type)) log(`data channel ← ${type}`);
    if (type === 'output_audio_buffer.stopped') aiDone();
  });

  let callId: string | null = null;
  dc.stateChanged.subscribe((s) => {
    log(`data channel: ${s}`);
    if (s === 'open' && callId) {
      void api(`/poc/calls/${callId}/ready`).then(() => log('POST /ready → server sent response.create'));
    }
  });

  await pc.setLocalDescription(await pc.createOffer());
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    pc.iceGatheringStateChange.subscribe((s) => s === 'complete' && resolve());
  });

  log(`POST /poc/connect (voice=${voice})`);
  const connected = (await api('/poc/connect', { sdpOffer: pc.localDescription!.sdp, voice })) as {
    callId: string;
    sdpAnswer: string;
  };
  callId = connected.callId;
  log(`connected: ${callId}`);
  await pc.setRemoteDescription({ type: 'answer', sdp: connected.sdpAnswer });

  const timedOut = await Promise.race([
    aiResponded.then(() => false),
    new Promise<boolean>((r) => setTimeout(() => r(true), TIMEOUT_MS)),
  ]);
  if (timedOut) log(`TIMEOUT: no complete AI response within ${TIMEOUT_MS / 1000}s`);

  const ended = (await api(`/poc/calls/${callId}/end`)) as {
    status: string;
    endReason: string;
    turns: Array<{ speaker: string; text: string }>;
  };
  log(`POST /end → ${ended.status} (${ended.endReason})`);
  await pc.close();

  console.log('\n── Result ──────────────────────────────────────');
  console.log(`first AI audio RTP : ${firstRtpAt ?? 'none'}   (${rtpPackets} audio packets)`);
  console.log(`provider events    : ${providerEvents.length} on data channel`);
  console.log('transcript (from sideband):');
  for (const t of ended.turns) console.log(`  ${t.speaker.padEnd(4)} ${t.text}`);
  const pass = !timedOut && rtpPackets > 20 && ended.turns.some((t) => t.speaker === 'AI' && t.text.length > 0);
  console.log(`\nS1 ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
