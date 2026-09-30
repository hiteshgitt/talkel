/**
 * Mixes the user's voice (16 kHz) and the AI's voice (24 kHz) onto one 24 kHz mono timeline,
 * placed by the time each frame was actually heard/said, and hands out finished 20 ms frames.
 */

export const MIX_RATE = 24000;
const FRAME = MIX_RATE / 50; // 480 samples = 20 ms
/** Frames younger than this may still receive audio (network jitter), so they are held back. */
const HOLD_MS = 300;

export class RecordingMixer {
  private readonly slots = new Map<number, Int32Array>();
  private nextOut = 0;
  private base: number;

  constructor(startMs: number) {
    this.base = startMs;
  }

  /** AI audio exactly as played to the phone. */
  addAi(pcm24k: Buffer, atMs: number): void {
    this.add(toInt16(pcm24k), atMs);
  }

  /** User microphone audio (16 kHz), upsampled to the mix rate. */
  addUser(pcm16k: Buffer, atMs: number): void {
    this.add(upsample16to24(toInt16(pcm16k)), atMs);
  }

  /** Completed frames, in order; gaps are filled with silence so the timeline stays true. */
  drain(nowMs: number): Int16Array[] {
    const upTo = Math.floor((nowMs - this.base - HOLD_MS) / 20);
    return this.emitUntil(upTo);
  }

  /** Everything left, e.g. when recording stops. */
  flushAll(): Int16Array[] {
    const last = this.slots.size ? Math.max(...this.slots.keys()) + 1 : this.nextOut;
    return this.emitUntil(last);
  }

  private emitUntil(upTo: number): Int16Array[] {
    const out: Int16Array[] = [];
    for (; this.nextOut < upTo; this.nextOut++) {
      const slot = this.slots.get(this.nextOut);
      this.slots.delete(this.nextOut);
      const frame = new Int16Array(FRAME);
      if (slot) for (let i = 0; i < FRAME; i++) frame[i] = Math.max(-32768, Math.min(32767, slot[i]!));
      out.push(frame);
    }
    return out;
  }

  private add(samples: Int16Array, atMs: number): void {
    let pos = Math.round(((atMs - this.base) * MIX_RATE) / 1000);
    if (pos < this.nextOut * FRAME) pos = this.nextOut * FRAME; // too late: append rather than drop
    for (let i = 0; i < samples.length; i++, pos++) {
      const index = Math.floor(pos / FRAME);
      let slot = this.slots.get(index);
      if (!slot) {
        slot = new Int32Array(FRAME);
        this.slots.set(index, slot);
      }
      slot[pos - index * FRAME]! += samples[i]!;
    }
  }
}

function toInt16(buf: Buffer): Int16Array {
  const out = new Int16Array(Math.floor(buf.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

/** Linear-interpolation resample 16 kHz → 24 kHz (3 output samples per 2 input). */
export function upsample16to24(input: Int16Array): Int16Array {
  const out = new Int16Array(Math.floor((input.length * 3) / 2));
  for (let i = 0; i < out.length; i++) {
    const src = (i * 2) / 3;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    out[i] = Math.round(input[i0]! * (1 - t) + input[i1]! * t);
  }
  return out;
}
