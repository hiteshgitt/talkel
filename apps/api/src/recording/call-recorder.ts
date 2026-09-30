import type { WriteStream } from 'node:fs';
import OpusScript from 'opusscript';
import { OggOpusWriter } from './ogg-opus-writer.js';
import { MIX_RATE, RecordingMixer } from './recording-mixer.js';

const FRAME_SAMPLES = MIX_RATE / 50; // 20 ms at 24 kHz
const SAMPLES_48K_PER_FRAME = 960;
/** Speech-quality Opus for storage: ~0.25 MB per minute. */
const STORAGE_BITRATE = 32_000;
const OPUS_SET_COMPLEXITY_REQUEST = 4010;

export interface RecordingResult {
  durationMs: number;
  bytes: number;
}

/**
 * Records one call (both voices) to Ogg Opus, streaming to storage as it goes so a crash loses
 * at most a second. Can be paused and resumed; paused time is simply not in the file.
 */
export class CallRecorder {
  private readonly encoder = new OpusScript(MIX_RATE, 1, OpusScript.Application.AUDIO);
  private readonly writer: OggOpusWriter;
  private mixer: RecordingMixer | null = null;
  private bytes = 0;
  private closed = false;

  constructor(private readonly out: WriteStream) {
    this.encoder.setBitrate(STORAGE_BITRATE);
    this.encoder.encoderCTL(OPUS_SET_COMPLEXITY_REQUEST, 10);
    this.writer = new OggOpusWriter(
      (chunk) => {
        this.bytes += chunk.length;
        out.write(chunk);
      },
      { inputSampleRate: MIX_RATE, channels: 1, preSkip: 312 },
    );
  }

  get recording(): boolean {
    return this.mixer !== null;
  }

  resume(atMs: number): void {
    if (this.closed || this.mixer) return;
    this.mixer = new RecordingMixer(atMs);
  }

  pause(): void {
    if (!this.mixer) return;
    this.encodeFrames(this.mixer.flushAll());
    this.mixer = null;
  }

  addUser(pcm16k: Buffer, atMs: number): void {
    this.mixer?.addUser(pcm16k, atMs);
  }

  addAi(pcm24k: Buffer, atMs: number): void {
    this.mixer?.addAi(pcm24k, atMs);
  }

  /** Call regularly (e.g. every 200 ms) to encode settled audio. */
  tick(nowMs: number): void {
    if (this.mixer) this.encodeFrames(this.mixer.drain(nowMs));
  }

  async finish(): Promise<RecordingResult> {
    if (!this.closed) {
      this.pause();
      this.closed = true;
      this.writer.finish();
      this.encoder.delete();
      await new Promise<void>((resolve, reject) => {
        this.out.once('error', reject);
        this.out.end(resolve);
      });
    }
    return { durationMs: Math.round(this.writer.durationMs), bytes: this.bytes };
  }

  private encodeFrames(frames: Int16Array[]): void {
    for (const f of frames) {
      if (f.length !== FRAME_SAMPLES) continue;
      const packet = this.encoder.encode(Buffer.from(f.buffer, f.byteOffset, f.byteLength), FRAME_SAMPLES);
      this.writer.writePacket(packet, SAMPLES_48K_PER_FRAME);
    }
  }
}
