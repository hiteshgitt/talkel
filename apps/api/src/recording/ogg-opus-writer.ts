/**
 * Minimal Ogg Opus muxer (RFC 7845): identification header, comment header, then audio pages.
 * Enough for standard players (Android MediaPlayer/ExoPlayer, browsers) to play and seek.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32 (polynomial 0x04c11db7, no reflection, init 0). */
export function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
  return crc >>> 0;
}

export interface OggOpusOptions {
  /** Original input sample rate (informational for players). */
  inputSampleRate: number;
  channels: 1 | 2;
  /** Encoder lookahead to discard, in 48 kHz samples. */
  preSkip: number;
  /** Flush a page after this many packets (~1 s at 20 ms). */
  packetsPerPage?: number;
}

export class OggOpusWriter {
  private readonly serial = (Math.random() * 0xffffffff) >>> 0;
  private pageSeq = 0;
  private granule = 0n;
  private pending: Buffer[] = [];
  private finished = false;

  constructor(
    private readonly sink: (chunk: Buffer) => void,
    private readonly opts: OggOpusOptions,
  ) {
    this.writeHeaders();
  }

  /** Adds one Opus packet covering `samples48k` samples (960 for 20 ms). */
  writePacket(packet: Buffer, samples48k: number): void {
    if (this.finished) throw new Error('writer finished');
    this.pending.push(packet);
    this.granule += BigInt(samples48k);
    if (this.pending.length >= (this.opts.packetsPerPage ?? 50)) this.flush(false);
  }

  /** Writes the remaining packets with the end-of-stream flag. */
  finish(): void {
    if (this.finished) return;
    this.flush(true);
    this.finished = true;
  }

  /** Total audio written, in milliseconds (excluding pre-skip). */
  get durationMs(): number {
    return Math.max(0, Number(this.granule - BigInt(this.opts.preSkip)) / 48);
  }

  private writeHeaders(): void {
    const head = Buffer.alloc(19);
    head.write('OpusHead', 0, 'ascii');
    head.writeUInt8(1, 8); // version
    head.writeUInt8(this.opts.channels, 9);
    head.writeUInt16LE(this.opts.preSkip, 10);
    head.writeUInt32LE(this.opts.inputSampleRate, 12);
    head.writeInt16LE(0, 16); // output gain
    head.writeUInt8(0, 18); // channel mapping family 0 (mono/stereo)
    this.page([head], 0n, 0x02); // beginning of stream

    const vendor = Buffer.from('speakai', 'utf8');
    const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
    tags.write('OpusTags', 0, 'ascii');
    tags.writeUInt32LE(vendor.length, 8);
    vendor.copy(tags, 12);
    tags.writeUInt32LE(0, 12 + vendor.length); // no user comments
    this.page([tags], 0n, 0);
  }

  private flush(last: boolean): void {
    if (this.pending.length === 0) {
      // Players expect an end-of-stream page even if no packets are left.
      if (last) this.page([], this.granule, 0x04);
      return;
    }
    // An Ogg page holds at most 255 lacing values; split if needed.
    let packets = this.pending;
    this.pending = [];
    while (packets.length > 0) {
      let lacing = 0;
      let count = 0;
      for (const p of packets) {
        const need = Math.floor(p.length / 255) + 1;
        if (lacing + need > 255) break;
        lacing += need;
        count++;
      }
      const onPage = packets.slice(0, count);
      packets = packets.slice(count);
      this.page(onPage, this.granule, last && packets.length === 0 ? 0x04 : 0);
    }
  }

  private page(packets: Buffer[], granule: bigint, headerType: number): void {
    const segments: number[] = [];
    for (const p of packets) {
      let n = p.length;
      while (n >= 255) {
        segments.push(255);
        n -= 255;
      }
      segments.push(n);
    }
    const header = Buffer.alloc(27 + segments.length);
    header.write('OggS', 0, 'ascii');
    header.writeUInt8(0, 4); // stream structure version
    header.writeUInt8(headerType, 5);
    header.writeBigUInt64LE(granule, 6);
    header.writeUInt32LE(this.serial, 14);
    header.writeUInt32LE(this.pageSeq++, 18);
    header.writeUInt32LE(0, 22); // checksum placeholder
    header.writeUInt8(segments.length, 26);
    segments.forEach((s, i) => header.writeUInt8(s, 27 + i));
    const page = Buffer.concat([header, ...packets]);
    page.writeUInt32LE(oggCrc(page), 22);
    this.sink(page);
  }
}
