/**
 * PCM16 (little-endian, mono) helpers for the media bridge.
 * Phone → AI: 16 kHz (what Gemini Live expects). AI → phone: 24 kHz (what Gemini Live produces).
 */

export const FRAME_MS = 20;

export function frameBytes(sampleRate: number): number {
  return (sampleRate / 1000) * FRAME_MS * 2;
}

/** Root-mean-square level of a PCM16 buffer, normalised to 0..1. */
export function rmsLevel(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const s = pcm.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / samples);
}

/**
 * Buffers AI audio that arrives in bursts (faster than real time) and hands it out in fixed
 * 20 ms frames for real-time RTP pacing. `clear()` implements barge-in: drop everything queued.
 */
export class PcmPacer {
  private readonly chunks: Buffer[] = [];
  private queued = 0;
  private readonly frame: number;

  constructor(sampleRate: number) {
    this.frame = frameBytes(sampleRate);
  }

  push(pcm: Buffer): void {
    if (pcm.length === 0) return;
    this.chunks.push(pcm);
    this.queued += pcm.length;
  }

  /** Next full 20 ms frame; a final partial frame is zero-padded. Null when empty. */
  nextFrame(): Buffer | null {
    if (this.queued === 0) return null;
    const out = Buffer.alloc(this.frame);
    let filled = 0;
    while (filled < this.frame && this.chunks.length > 0) {
      const head = this.chunks[0]!;
      const take = Math.min(head.length, this.frame - filled);
      head.copy(out, filled, 0, take);
      filled += take;
      if (take === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(take);
    }
    this.queued -= filled;
    return out;
  }

  clear(): void {
    this.chunks.length = 0;
    this.queued = 0;
  }

  get queuedMs(): number {
    return (this.queued / this.frame) * FRAME_MS;
  }
}

/**
 * Tiny energy-based speech detector used only for UI state ("Listening…") and turn timing.
 * Turn-taking itself is decided by the AI provider's VAD, not by this.
 */
export class SpeechLevelDetector {
  private speaking = false;
  private loudMs = 0;
  private quietMs = 0;

  constructor(
    private readonly threshold = 0.02,
    private readonly attackMs = 60,
    private readonly releaseMs = 500,
  ) {}

  /** Feed one 20 ms frame; returns 'start' | 'stop' on transitions, else null. */
  push(pcm: Buffer): 'start' | 'stop' | null {
    const loud = rmsLevel(pcm) >= this.threshold;
    if (loud) {
      this.loudMs += FRAME_MS;
      this.quietMs = 0;
    } else {
      this.quietMs += FRAME_MS;
      this.loudMs = 0;
    }
    if (!this.speaking && this.loudMs >= this.attackMs) {
      this.speaking = true;
      return 'start';
    }
    if (this.speaking && this.quietMs >= this.releaseMs) {
      this.speaking = false;
      return 'stop';
    }
    return null;
  }
}
