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
