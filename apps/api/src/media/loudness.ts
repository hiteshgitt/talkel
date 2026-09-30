/**
 * Gentle automatic gain for the AI voice: brings speech to a consistent level so it's clear on a
 * phone earpiece, without pumping. Silence is never boosted; peaks are soft-limited, not clipped.
 */
export class LoudnessNormalizer {
  private gain = 1;

  constructor(
    /** Target speech RMS (0..1). 0.12 ≈ −18 dBFS: loud and clear, with headroom. */
    private readonly targetRms = 0.12,
    private readonly maxGain = 3.0,
    private readonly minGain = 0.6,
  ) {}

  /** Processes PCM16 (in place on a copy) and returns the adjusted audio. */
  process(pcm: Buffer): Buffer {
    const n = Math.floor(pcm.length / 2);
    if (n === 0) return pcm;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const s = pcm.readInt16LE(i * 2) / 32768;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / n);
    if (rms > 0.01) {
      // Only adapt on actual speech. Drop quickly (avoid overload), rise slowly (avoid pumping).
      const desired = Math.min(this.maxGain, Math.max(this.minGain, this.targetRms / rms));
      const rate = desired < this.gain ? 0.5 : 0.08;
      this.gain += (desired - this.gain) * rate;
    }
    const out = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const x = (pcm.readInt16LE(i * 2) / 32768) * this.gain;
      out.writeInt16LE(Math.round(softLimit(x) * 32767), i * 2);
    }
    return out;
  }

  get currentGain(): number {
    return this.gain;
  }
}

/** Linear below 0.8, then smoothly approaches ±0.98 — never full scale, so never digital clipping. */
export function softLimit(x: number): number {
  const a = Math.abs(x);
  if (a <= 0.8) return x;
  const over = a - 0.8;
  return Math.sign(x) * (0.8 + 0.18 * Math.tanh(over / 0.18));
}
