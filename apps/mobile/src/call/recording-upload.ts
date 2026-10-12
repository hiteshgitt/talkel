import type { LiveAudioRequest } from '@speakai/contracts';
import { api } from '@/lib/api';

type Chunk = LiveAudioRequest['chunks'][number] & { endMs: number };

/** Mic level below this is silence and isn't uploaded (the gap is silence in the file anyway). */
const QUIET_LEVEL = 0.008;
/** Keep sending this long after the last sound, so word endings aren't clipped. */
const HANGOVER_MS = 600;
const MIC_CHUNK_MS = 40;
/** The AI's audio is 24 kHz PCM16: 48 bytes per millisecond. */
const AI_BYTES_PER_MS = 48;
const SEND_EVERY_MS = 1_000;
const MAX_CHUNKS_PER_REQUEST = 300;

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/**
 * Direct calls never pass through our server, so while the user records, the phone uploads both
 * voices (about once a second) and the server mixes and encodes the file. Times are on the call
 * clock (`now`), the same clock the start/stop requests use.
 */
export class RecordingUpload {
  private queue: Chunk[] = [];
  /** When the AI audio queued for playback will have finished playing. */
  private aiPlayedUntil = 0;
  private lastSoundAt = -Infinity;
  private quietChunk: Chunk | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending: Promise<void> = Promise.resolve();
  /** Capturing (from the moment the user taps Record, before the server confirms). */
  private capturing = false;

  constructor(
    private readonly conversationId: string,
    private readonly now: () => number,
  ) {}

  start(): void {
    this.capturing = true;
    this.aiPlayedUntil = this.now();
  }

  /** The server confirmed: begin uploading. */
  confirmed(): void {
    this.timer ??= setInterval(() => void this.flush(false), SEND_EVERY_MS);
  }

  /** Stops capturing and uploads everything still queued. */
  async stop(): Promise<void> {
    this.capturing = false;
    this.quietChunk = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      await this.flush(true);
    }
    this.queue = [];
  }

  /** Recording didn't start after all. */
  discard(): void {
    this.capturing = false;
    this.queue = [];
    this.quietChunk = null;
  }

  mic(data: string, level: number): void {
    if (!this.capturing) return;
    const now = this.now();
    const chunk: Chunk = { speaker: 'USER', atMs: Math.max(0, now - MIC_CHUNK_MS), endMs: now, data };
    if (level >= QUIET_LEVEL) {
      // Include the quiet chunk just before, so the start of a word isn't cut.
      if (this.quietChunk) this.queue.push(this.quietChunk);
      this.lastSoundAt = now;
    }
    this.quietChunk = null;
    if (now - this.lastSoundAt <= HANGOVER_MS) this.queue.push(chunk);
    else this.quietChunk = chunk;
  }

  /** AI audio as it's queued for playback; it plays after whatever is already queued. */
  ai(data: string): void {
    if (!this.capturing) return;
    const atMs = Math.max(this.now(), this.aiPlayedUntil);
    this.aiPlayedUntil = atMs + base64Bytes(data) / AI_BYTES_PER_MS;
    this.queue.push({ speaker: 'AI', atMs: Math.round(atMs), endMs: this.aiPlayedUntil, data });
  }

  /** Barge-in: queued AI audio that hadn't played yet never will. */
  aiCleared(): void {
    const now = this.now();
    this.queue = this.queue.filter((c) => c.speaker === 'USER' || c.atMs < now);
    this.aiPlayedUntil = now;
  }

  /** Sends what has already been heard (or everything, when stopping). Sends never overlap. */
  private flush(all: boolean): Promise<void> {
    this.sending = this.sending.then(async () => {
      const until = all ? Infinity : this.now();
      const ready = this.queue.filter((c) => c.endMs <= until);
      this.queue = this.queue.filter((c) => c.endMs > until);
      const untilMs = Math.round(all ? Math.max(this.now(), ...ready.map((c) => c.endMs)) : until);
      for (let i = 0; i < ready.length || i === 0; i += MAX_CHUNKS_PER_REQUEST) {
        const chunks = ready.slice(i, i + MAX_CHUNKS_PER_REQUEST).map(({ speaker, atMs, data }) => ({ speaker, atMs, data }));
        // A lost batch is a short gap in the recording; the call itself is unaffected.
        await api.liveAudio(this.conversationId, { chunks, untilMs }).catch(() => undefined);
      }
    });
    return this.sending;
  }
}
