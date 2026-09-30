import { describe, expect, it } from 'vitest';
import { frameBytes, PcmPacer, rmsLevel, SpeechLevelDetector } from './pcm.js';

function tone(samples: number, amplitude: number): Buffer {
  const b = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(amplitude * 32767 * Math.sin(i / 3)), i * 2);
  return b;
}

describe('PcmPacer', () => {
  it('re-frames bursty chunks into exact 20 ms frames and zero-pads the tail', () => {
    const pacer = new PcmPacer(24000); // 960 bytes per frame
    pacer.push(Buffer.alloc(500, 1));
    pacer.push(Buffer.alloc(1000, 2));
    expect(Math.round(pacer.queuedMs)).toBe(31);

    const f1 = pacer.nextFrame()!;
    expect(f1.length).toBe(960);
    expect(f1[0]).toBe(1);
    expect(f1[499]).toBe(1);
    expect(f1[500]).toBe(2);

    const f2 = pacer.nextFrame()!;
    expect(f2.length).toBe(960);
    expect(f2[539]).toBe(2);
    expect(f2[540]).toBe(0); // padding

    expect(pacer.nextFrame()).toBeNull();
  });

  it('pre-buffers each talk-spurt, then plays continuously until the queue runs dry', () => {
    const pacer = new PcmPacer(24000, { prebufferMs: 100, maxHoldMs: 200 });
    const frame = frameBytes(24000);

    pacer.push(Buffer.alloc(frame * 2), 0); // 40 ms queued
    expect(pacer.nextFrame(20)).toBeNull(); // below 100 ms: hold
    pacer.push(Buffer.alloc(frame * 3), 30); // 100 ms queued
    expect(pacer.nextFrame(40)).not.toBeNull(); // start
    pacer.push(Buffer.alloc(frame), 50);
    // Once flowing, it keeps going even below the pre-buffer level.
    for (let i = 0; i < 5; i++) expect(pacer.nextFrame(60 + i * 20)).not.toBeNull();
    expect(pacer.nextFrame(200)).toBeNull(); // dry → next talk-spurt pre-buffers again

    pacer.push(Buffer.alloc(frame), 300);
    expect(pacer.nextFrame(320)).toBeNull();
  });

  it('starts a short utterance after maxHoldMs even if the pre-buffer never fills', () => {
    const pacer = new PcmPacer(24000, { prebufferMs: 100, maxHoldMs: 200 });
    pacer.push(Buffer.alloc(frameBytes(24000)), 1000);
    expect(pacer.nextFrame(1100)).toBeNull();
    expect(pacer.nextFrame(1200)).not.toBeNull();
  });

  it('clear() drops queued audio (barge-in)', () => {
    const pacer = new PcmPacer(24000);
    pacer.push(Buffer.alloc(frameBytes(24000) * 10));
    pacer.clear();
    expect(pacer.nextFrame()).toBeNull();
    expect(pacer.queuedMs).toBe(0);
  });
});

describe('rmsLevel', () => {
  it('is 0 for silence and grows with amplitude', () => {
    expect(rmsLevel(Buffer.alloc(640))).toBe(0);
    expect(rmsLevel(tone(320, 0.5))).toBeGreaterThan(rmsLevel(tone(320, 0.05)));
  });
});

describe('SpeechLevelDetector', () => {
  it('needs sustained energy to start and sustained quiet to stop', () => {
    const d = new SpeechLevelDetector(0.02, 60, 100);
    const loud = tone(320, 0.3);
    const quiet = Buffer.alloc(640);

    expect(d.push(loud)).toBeNull();
    expect(d.push(loud)).toBeNull();
    expect(d.push(loud)).toBe('start');
    expect(d.push(quiet)).toBeNull();
    expect(d.push(loud)).toBeNull(); // brief dip doesn't end speech
    for (let i = 0; i < 4; i++) d.push(quiet);
    expect(d.push(quiet)).toBe('stop');
  });
});

describe('LoudnessNormalizer', () => {
  const rmsOf = (b: Buffer) => rmsLevel(b);

  it('brings quiet speech up towards the target without touching silence', async () => {
    const { LoudnessNormalizer } = await import('./loudness.js');
    const n = new LoudnessNormalizer(0.12);
    let out: Buffer = Buffer.alloc(0);
    for (let i = 0; i < 40; i++) out = n.process(tone(480, 0.05)); // quiet speech, ~0.035 RMS
    expect(rmsOf(out)).toBeGreaterThan(0.09);
    expect(rmsOf(n.process(Buffer.alloc(960)))).toBe(0);
  });

  it('never clips: loud input is soft-limited below full scale', async () => {
    const { LoudnessNormalizer, softLimit } = await import('./loudness.js');
    const n = new LoudnessNormalizer(0.5, 3);
    const out = n.process(tone(480, 0.99));
    let peak = 0;
    for (let i = 0; i < out.length / 2; i++) peak = Math.max(peak, Math.abs(out.readInt16LE(i * 2)));
    expect(peak).toBeLessThan(32767);
    expect(softLimit(0.5)).toBe(0.5);
    expect(softLimit(5)).toBeLessThan(1);
  });
});
