import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { CallEventLog } from './live-call.js';

/** Append-only JSONL log per call: logs/calls/<callId>.jsonl — input to the M0 latency/transcript report. */
export class JsonlCallLog implements CallEventLog {
  private readonly stream: WriteStream;
  private closed = false;

  constructor(dir: string, callId: string) {
    mkdirSync(dir, { recursive: true });
    this.stream = createWriteStream(join(dir, `${callId}.jsonl`), { flags: 'a' });
  }

  write(entry: { t: number; dir: 'in' | 'out' | 'sys'; event: unknown }): void {
    if (!this.closed) this.stream.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stream.end();
  }
}
