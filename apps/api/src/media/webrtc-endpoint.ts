import OpusScript from 'opusscript';
import {
  RTCPeerConnection,
  RTCRtpCodecParameters,
  type RTCDataChannel,
  type RTCRtpTransceiver,
  RtpHeader,
  RtpPacket,
} from 'werift';
import { LoudnessNormalizer } from './loudness.js';
import { FRAME_MS, PcmPacer } from './pcm.js';

/**
 * Server-side WebRTC peer for one phone call (our "voice gateway").
 *
 * The phone keeps using native WebRTC (echo cancellation, jitter buffer, Opus), but its peer is
 * this server instead of the AI provider. We decode the phone's Opus to 16 kHz PCM for the AI,
 * and encode the AI's 24 kHz PCM back to Opus, paced in real time so barge-in can drop audio
 * that hasn't been played yet.
 */
export interface MediaEndpoint {
  onUserPcm(handler: (pcm16k: Buffer) => void): void;
  onControlOpen(handler: () => void): void;
  onPlayback(handler: (state: 'started' | 'stopped') => void): void;
  /** Every 20 ms AI frame at the moment it is sent to the phone (for recording what was heard). */
  onAiFrame(handler: (pcm24k: Buffer, atMs: number) => void): void;
  onClosed(handler: (reason: string) => void): void;
  playAiPcm(pcm24k: Buffer): void;
  /** Barge-in: drop queued AI audio immediately. */
  clearPlayback(): void;
  /** The AI finished its reply, so running out of audio after this is expected, not an underrun. */
  aiTurnEnded(): void;
  sendControl(event: Record<string, unknown>): void;
  /** Audio quality counters for diagnosing choppy audio (network vs. our pacing vs. provider). */
  stats(): MediaStats;
  close(): Promise<void>;
}

export interface MediaStats {
  /** Talk-spurts that ran dry mid-way (provider delivered audio slower than real time). */
  playbackUnderruns: number;
  /** Worst lateness of our 20 ms send timer; > ~40 ms means our server is causing jitter. */
  maxSendLatenessMs: number;
  /** From the phone's RTCP receiver reports about the audio we send it. */
  phoneReportedLossPct: number | null;
  phoneReportedMaxLossPct: number | null;
  phoneReportedJitterMs: number | null;
  phoneReportedMaxJitterMs: number | null;
  phoneReportedPacketsLost: number | null;
}

export interface WebRtcEndpointOptions {
  iceServers: Array<{ urls: string }>;
  /** Local UDP ports for media, e.g. [40000, 40099]. */
  udpPortRange?: [number, number];
}

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const OPUS_RTP_CLOCK = 48000;
const DISCONNECT_GRACE_MS = 5000;
/**
 * AI voice to the phone: full-band "audio" mode (no speech-band processing) at a generous bitrate
 * and maximum encoder quality, with in-band FEC for Wi-Fi/mobile loss.
 */
const OPUS_BITRATE = 64_000;
const OPUS_SET_COMPLEXITY_REQUEST = 4010;
const OPUS_SET_INBAND_FEC_REQUEST = 4012;
const OPUS_SET_PACKET_LOSS_PERC_REQUEST = 4014;
const EXPECTED_LOSS_PCT = 10;
const PREBUFFER_MS = 120;
const MAX_HOLD_MS = 200;

export class WebRtcEndpoint implements MediaEndpoint {
  private readonly decoder = new OpusScript(INPUT_RATE, 1, OpusScript.Application.VOIP);
  private readonly encoder = new OpusScript(OUTPUT_RATE, 1, OpusScript.Application.AUDIO);
  private readonly loudness = new LoudnessNormalizer();
  private readonly pacer = new PcmPacer(OUTPUT_RATE, { prebufferMs: PREBUFFER_MS, maxHoldMs: MAX_HOLD_MS });
  private readonly counters: MediaStats = {
    playbackUnderruns: 0,
    maxSendLatenessMs: 0,
    phoneReportedLossPct: null,
    phoneReportedMaxLossPct: null,
    phoneReportedJitterMs: null,
    phoneReportedMaxJitterMs: null,
    phoneReportedPacketsLost: null,
  };
  /** True between AI audio arriving and the provider finishing that reply. */
  private aiTurnOpen = false;
  private transceiver: RTCRtpTransceiver | null = null;
  private control: RTCDataChannel | null = null;
  private pacerTimer: NodeJS.Timeout | null = null;
  private disconnectTimer: NodeJS.Timeout | null = null;
  private playing = false;
  private seq = Math.floor(Math.random() * 0xffff);
  private readonly rtpStart = performance.now();
  private closed = false;

  private userPcmHandlers: Array<(pcm: Buffer) => void> = [];
  private controlOpenHandlers: Array<() => void> = [];
  private playbackHandlers: Array<(s: 'started' | 'stopped') => void> = [];
  private aiFrameHandlers: Array<(pcm: Buffer, atMs: number) => void> = [];
  private closedHandlers: Array<(reason: string) => void> = [];

  private constructor(private readonly pc: RTCPeerConnection) {
    this.encoder.setBitrate(OPUS_BITRATE);
    this.encoder.encoderCTL(OPUS_SET_COMPLEXITY_REQUEST, 10);
    this.encoder.encoderCTL(OPUS_SET_INBAND_FEC_REQUEST, 1);
    this.encoder.encoderCTL(OPUS_SET_PACKET_LOSS_PERC_REQUEST, EXPECTED_LOSS_PCT);
  }

  /** Accepts the phone's SDP offer and returns the endpoint plus our SDP answer. */
  static async answer(sdpOffer: string, opts: WebRtcEndpointOptions): Promise<{ endpoint: WebRtcEndpoint; sdpAnswer: string }> {
    const pc = new RTCPeerConnection({
      iceServers: opts.iceServers,
      icePortRange: opts.udpPortRange,
      codecs: {
        audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: OPUS_RTP_CLOCK, channels: 2 })],
        video: [],
      },
    });
    const endpoint = new WebRtcEndpoint(pc);
    try {
      endpoint.transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      endpoint.wire();

      await pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIceGathering(pc, 3000);
      const sdpAnswer = pc.localDescription?.sdp;
      if (!sdpAnswer) throw new Error('no local description');
      // The transceiver actually used is the one negotiated against the phone's audio m-line.
      endpoint.transceiver = pc.getTransceivers().find((t) => t.kind === 'audio') ?? endpoint.transceiver;
      endpoint.startPacer();
      return { endpoint, sdpAnswer };
    } catch (err) {
      await endpoint.close();
      throw err;
    }
  }

  onUserPcm(h: (pcm16k: Buffer) => void): void {
    this.userPcmHandlers.push(h);
  }
  onControlOpen(h: () => void): void {
    this.controlOpenHandlers.push(h);
  }
  onPlayback(h: (state: 'started' | 'stopped') => void): void {
    this.playbackHandlers.push(h);
  }
  onAiFrame(h: (pcm24k: Buffer, atMs: number) => void): void {
    this.aiFrameHandlers.push(h);
  }
  onClosed(h: (reason: string) => void): void {
    this.closedHandlers.push(h);
  }

  playAiPcm(pcm24k: Buffer): void {
    if (this.closed) return;
    this.aiTurnOpen = true;
    this.pacer.push(this.loudness.process(pcm24k), performance.now());
  }

  /** The provider finished (or abandoned) its reply: running dry after this is not an underrun. */
  aiTurnEnded(): void {
    this.aiTurnOpen = false;
  }

  clearPlayback(): void {
    this.pacer.clear();
    this.aiTurnOpen = false;
    this.setPlaying(false);
  }

  stats(): MediaStats {
    return { ...this.counters };
  }

  sendControl(event: Record<string, unknown>): void {
    if (this.control?.readyState === 'open') this.control.send(JSON.stringify(event));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.pacerTimer) clearTimeout(this.pacerTimer);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.pacer.clear();
    try {
      await this.pc.close();
    } catch {
      // already closed
    }
    this.decoder.delete();
    this.encoder.delete();
  }

  private wire(): void {
    this.pc.onTrack.subscribe((track) => {
      if (track.kind !== 'audio') return;
      track.onReceiveRtp.subscribe((rtp) => {
        // Decode even tiny silence frames: the AI's end-of-speech detection needs the silence.
        if (this.closed || rtp.payload.length === 0) return;
        let pcm: Buffer;
        try {
          pcm = this.decoder.decode(rtp.payload);
        } catch {
          return; // corrupt packet: Opus PLC on the next frame covers it
        }
        for (const h of this.userPcmHandlers) h(pcm);
      });
    });

    this.pc.onDataChannel.subscribe((channel) => {
      this.control = channel;
      const opened = () => {
        for (const h of this.controlOpenHandlers) h();
      };
      if (channel.readyState === 'open') opened();
      else channel.stateChanged.subscribe((s) => s === 'open' && opened());
    });

    this.pc.connectionStateChange.subscribe((state) => {
      if (state === 'connected') {
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
      } else if (state === 'disconnected') {
        this.disconnectTimer ??= setTimeout(() => this.emitClosed('media disconnected'), DISCONNECT_GRACE_MS);
      } else if (state === 'failed' || state === 'closed') {
        this.emitClosed(`media ${state}`);
      }
    });
  }

  /** Sends one 20 ms Opus frame per tick, scheduled against the wall clock to avoid drift. */
  private startPacer(): void {
    this.watchPhoneReports();
    let next = performance.now();
    const tick = () => {
      if (this.closed) return;
      const now = performance.now();
      this.counters.maxSendLatenessMs = Math.max(this.counters.maxSendLatenessMs, Math.round(now - next));
      const frame = this.pacer.nextFrame(now);
      if (frame) {
        const talkSpurtStart = !this.playing;
        this.setPlaying(true);
        this.sendFrame(frame, talkSpurtStart);
      } else {
        if (this.playing && this.aiTurnOpen) this.counters.playbackUnderruns++;
        this.setPlaying(false);
      }
      next += FRAME_MS;
      this.pacerTimer = setTimeout(tick, Math.max(0, next - performance.now()));
    };
    tick();
  }

  private sendFrame(pcm: Buffer, talkSpurtStart: boolean): void {
    for (const h of this.aiFrameHandlers) h(pcm, performance.now());
    const sender = this.transceiver?.sender;
    if (!sender) return;
    let opus: Buffer;
    try {
      opus = this.encoder.encode(pcm, OUTPUT_RATE / (1000 / FRAME_MS));
    } catch {
      return;
    }
    // RTP timestamp follows the wall clock (48 kHz Opus clock) so gaps between AI turns
    // are represented truthfully to the phone's jitter buffer.
    const elapsedMs = performance.now() - this.rtpStart;
    const header = new RtpHeader({
      payloadType: 111, // rewritten by the sender to the negotiated PT
      sequenceNumber: (this.seq = (this.seq + 1) & 0xffff),
      timestamp: Math.floor((elapsedMs * OPUS_RTP_CLOCK) / 1000) >>> 0,
      marker: talkSpurtStart,
    });
    void sender.sendRtp(new RtpPacket(header, opus)).catch(() => undefined);
  }

  /** RTCP receiver reports from the phone describe loss/jitter of the audio we send it. */
  private watchPhoneReports(): void {
    const sender = this.transceiver?.sender;
    if (!sender) return;
    sender.onRtcp.subscribe((packet) => {
      const reports = (packet as { reports?: Array<{ fractionLost: number; jitter: number; packetsLost: number }> }).reports;
      for (const r of reports ?? []) {
        const lossPct = Math.round((r.fractionLost / 256) * 1000) / 10;
        const jitterMs = Math.round(r.jitter / (OPUS_RTP_CLOCK / 1000));
        const c = this.counters;
        c.phoneReportedLossPct = lossPct;
        c.phoneReportedMaxLossPct = Math.max(c.phoneReportedMaxLossPct ?? 0, lossPct);
        c.phoneReportedJitterMs = jitterMs;
        c.phoneReportedMaxJitterMs = Math.max(c.phoneReportedMaxJitterMs ?? 0, jitterMs);
        c.phoneReportedPacketsLost = r.packetsLost;
      }
    });
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    for (const h of this.playbackHandlers) h(playing ? 'started' : 'stopped');
  }

  private emitClosed(reason: string): void {
    const handlers = this.closedHandlers;
    this.closedHandlers = [];
    for (const h of handlers) h(reason);
  }
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs); // answer with whatever candidates we have
    pc.iceGatheringStateChange.subscribe((s) => {
      if (s === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
