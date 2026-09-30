import { describe, expect, it } from 'vitest';
import { OggOpusWriter, oggCrc } from './ogg-opus-writer.js';
import { RecordingMixer, upsample16to24 } from './recording-mixer.js';

const pcm = (samples: number[]) => {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => b.writeInt16LE(s, i * 2));
  return b;
};

describe('oggCrc', () => {
  it('matches the Ogg CRC-32 reference value', () => {
    // CRC of "OggS" with this polynomial/init is a fixed known value.
    expect(oggCrc(Buffer.from('123456789', 'ascii'))).toBe(0x89a1897f);
  });
});

describe('OggOpusWriter', () => {
  it('writes OpusHead, OpusTags and audio pages with correct flags, sequence and granule', () => {
    const chunks: Buffer[] = [];
    const w = new OggOpusWriter((c) => chunks.push(c), { inputSampleRate: 24000, channels: 1, preSkip: 312, packetsPerPage: 3 });
    for (let i = 0; i < 7; i++) w.writePacket(Buffer.alloc(40, i), 960);
    w.finish();

    const pages = chunks.map((c) => ({
      magic: c.toString('ascii', 0, 4),
      type: c.readUInt8(5),
      granule: c.readBigUInt64LE(6),
      seq: c.readUInt32LE(18),
      crcOk: (() => {
        const copy = Buffer.from(c);
        const crc = copy.readUInt32LE(22);
        copy.writeUInt32LE(0, 22);
        return oggCrc(copy) === crc;
      })(),
    }));
    expect(pages.every((p) => p.magic === 'OggS' && p.crcOk)).toBe(true);
    expect(pages.map((p) => p.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(pages[0]!.type).toBe(0x02); // beginning of stream
    expect(chunks[0]!.toString('ascii', 28, 36)).toBe('OpusHead');
    expect(chunks[1]!.toString('ascii', 28, 36)).toBe('OpusTags');
    expect(pages.at(-1)!.type).toBe(0x04); // end of stream
    expect(pages.at(-1)!.granule).toBe(7n * 960n);
    expect(Math.round(w.durationMs)).toBe(Math.round((7 * 960 - 312) / 48));
  });
});

it('always ends with an end-of-stream page, even right after a full page', () => {
  const chunks: Buffer[] = [];
  const w = new OggOpusWriter((c) => chunks.push(c), { inputSampleRate: 24000, channels: 1, preSkip: 312, packetsPerPage: 2 });
  w.writePacket(Buffer.alloc(10), 960);
  w.writePacket(Buffer.alloc(10), 960); // fills a page → flushed without EOS
  w.finish();
  expect(chunks.at(-1)!.readUInt8(5)).toBe(0x04);
  expect(chunks.at(-1)!.readBigUInt64LE(6)).toBe(1920n);
});

describe('RecordingMixer', () => {
  it('places both voices by time and fills gaps with silence', () => {
    const m = new RecordingMixer(1000);
    m.addAi(pcm(Array(480).fill(1000)), 1000); // frame 0
    m.addAi(pcm(Array(480).fill(1000)), 1060); // frame 3
    const frames = m.drain(1000 + 300 + 80); // hold back the last 300 ms
    expect(frames.length).toBe(4);
    expect(frames[0]![0]).toBe(1000);
    expect(frames[1]![0]).toBe(0); // gap → silence
    expect(frames[3]![100]).toBe(1000);
  });

  it('adds overlapping speech (barge-in) and clips instead of wrapping', () => {
    const m = new RecordingMixer(0);
    m.addAi(pcm(Array(480).fill(30000)), 0);
    m.addUser(pcm(Array(320).fill(10000)), 0); // 20 ms at 16 kHz → 480 samples at 24 kHz
    const [frame] = m.flushAll();
    expect(frame![10]).toBe(32767);
  });

  it('upsamples 16 kHz to 24 kHz', () => {
    const out = upsample16to24(new Int16Array([0, 300, 600, 900]));
    expect(out.length).toBe(6);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 200, 400, 600]);
  });
});
