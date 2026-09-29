/**
 * Milestone 0 call report: turns a sideband JSONL log (apps/api/logs/calls/<callId>.jsonl)
 * into turn-taking and latency numbers for docs/spikes/M0-REPORT.md.
 *
 *   node scripts/call-report.ts apps/api/logs/calls/rtc_xxx.jsonl [more.jsonl ...]
 *
 * "System latency" = user stops speaking (server VAD) → AI audio starts playing out
 * (output_audio_buffer.started). This is measured at the provider/sideband, so true
 * mouth-to-ear latency on the phone is higher by the network + device audio path; measure
 * that separately with an external recording (VOICE-ARCHITECTURE §8).
 */
import { readFileSync } from 'node:fs';

interface Entry {
  t: number;
  dir: 'in' | 'out' | 'sys';
  event: { type?: string; kind?: string; response?: { status?: string; usage?: Usage } } & Record<string, unknown>;
}
interface Usage {
  input_token_details?: { audio_tokens?: number; text_tokens?: number; cached_tokens?: number };
  output_token_details?: { audio_tokens?: number; text_tokens?: number };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function report(path: string): void {
  const entries: Entry[] = readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Entry);

  const latencies: number[] = [];
  let lastSpeechStop: number | null = null;
  let firstAiAudio: number | null = null;
  let userTurns = 0;
  let interruptions = 0;
  let aiSpeaking = false;
  const usage = { inAudio: 0, inText: 0, cached: 0, outAudio: 0, outText: 0 };
  let endReason = 'unknown';
  let lastT = 0;

  for (const { t, dir, event } of entries) {
    lastT = Math.max(lastT, t);
    if (dir === 'sys' && event.kind === 'ending') endReason = String(event.reason);
    if (dir !== 'in') continue;
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        userTurns++;
        if (aiSpeaking) interruptions++;
        break;
      case 'input_audio_buffer.speech_stopped':
        lastSpeechStop = t;
        break;
      case 'output_audio_buffer.started':
        aiSpeaking = true;
        firstAiAudio ??= t;
        if (lastSpeechStop !== null) latencies.push(t - lastSpeechStop);
        lastSpeechStop = null;
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        aiSpeaking = false;
        break;
      case 'response.done': {
        const u = event.response?.usage;
        usage.inAudio += u?.input_token_details?.audio_tokens ?? 0;
        usage.inText += u?.input_token_details?.text_tokens ?? 0;
        usage.cached += u?.input_token_details?.cached_tokens ?? 0;
        usage.outAudio += u?.output_token_details?.audio_tokens ?? 0;
        usage.outText += u?.output_token_details?.text_tokens ?? 0;
        break;
      }
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const fmt = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v)} ms`);
  console.log(`\n${path}`);
  console.log(`  duration            ${(lastT / 1000).toFixed(1)} s   end reason: ${endReason}`);
  console.log(`  first AI audio      ${fmt(firstAiAudio)} after sideband start`);
  console.log(`  user turns          ${userTurns}   barge-ins: ${interruptions}`);
  console.log(`  system latency      p50 ${fmt(percentile(sorted, 50))}   p90 ${fmt(percentile(sorted, 90))}   n=${sorted.length}`);
  console.log(
    `  tokens              in audio ${usage.inAudio}, in text ${usage.inText} (cached ${usage.cached}), out audio ${usage.outAudio}, out text ${usage.outText}`,
  );
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/call-report.ts <call-log.jsonl> [...]');
  process.exit(1);
}
for (const f of files) report(f);
