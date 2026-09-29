import type { PocCallStatus, PocEndReason, PocTranscriptResponse } from '@speakai/contracts';
import { SpeechLevelDetector } from '../media/pcm.js';
import type { MediaEndpoint } from '../media/webrtc-endpoint.js';
import { addUsage, type CallEventLog, emptyUsage, type LiveCall } from '../poc/live-call.js';
import type { GeminiEvent } from './gemini-events.js';
import type { LiveSession } from './gemini-live.js';
import { TurnTranscript } from './turn-transcript.js';

export interface GeminiCallDeps {
  callId: string;
  media: MediaEndpoint;
  live: LiveSession;
  log: CallEventLog;
  maxDurationMs: number;
  greetingCue: string;
  wrapUpCue: string;
  now?: () => number;
  onEnded?: (call: GeminiCallSession) => void;
  onError?: (message: string) => void;
}

const WRAP_UP_LEAD_MS = 60_000;
const STATS_LOG_INTERVAL_MS = 10_000;
type Floor = 'none' | 'user' | 'ai';

/**
 * One live call bridged phone ⇄ our WebRTC endpoint ⇄ Gemini Live. The server sits in the media
 * path, so it owns barge-in (drop queued AI audio), timing, transcripts, limits and ending.
 */
export class GeminiCallSession implements LiveCall {
  readonly usage = emptyUsage();
  private readonly now: () => number;
  private readonly startedAt: number;
  private readonly transcript = new TurnTranscript();
  private readonly vad = new SpeechLevelDetector();
  private readonly timers: NodeJS.Timeout[] = [];
  private status: PocCallStatus = 'CONNECTING';
  private endReason: PocEndReason | null = null;
  private endedAt: number | null = null;
  private greeted = false;
  private floor: Floor = 'none';
  private userSpeaking = false;
  private aiPlaying = false;

  constructor(private readonly deps: GeminiCallDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.startedAt = this.now();
  }

  get callId(): string {
    return this.deps.callId;
  }

  /** Audio-quality counters (see MediaStats), for logs and the M0 report. */
  mediaStats() {
    return this.deps.media.stats();
  }

  get isEnded(): boolean {
    return this.status === 'ENDED' || this.status === 'FAILED';
  }

  start(): void {
    const { media, live } = this.deps;

    media.onUserPcm((pcm) => {
      if (this.isEnded) return;
      live.sendUserAudio(pcm);
      const edge = this.vad.push(pcm);
      if (edge === 'start') {
        this.userSpeaking = true;
        this.transcript.userSpeechStarted(this.elapsed());
        this.logSys({ kind: 'user_speech_started' });
      } else if (edge === 'stop') {
        this.userSpeaking = false;
        this.logSys({ kind: 'user_speech_stopped' });
      }
      if (edge) this.updateFloor();
    });

    media.onPlayback((state) => {
      this.aiPlaying = state === 'started';
      this.logSys({ kind: `ai_playback_${state}` });
      this.updateFloor();
    });

    media.onControlOpen(() => this.logSys({ kind: 'control_channel_open' }));
    media.onClosed((reason) => {
      this.logSys({ kind: 'media_closed', reason });
      void this.end('CONNECTION_LOST');
    });

    live.onEvent((e, raw) => this.handleLive(e, raw));
    live.onClose((code, reason) => {
      this.logSys({ kind: 'provider_closed', code, reason });
      if (!this.isEnded) {
        this.deps.onError?.(`Gemini closed call ${this.callId}: ${code} ${reason}`);
        void this.end('PROVIDER_CLOSED');
      }
    });

    this.timers.push(
      setTimeout(() => this.cue(this.deps.wrapUpCue, false), Math.max(0, this.deps.maxDurationMs - WRAP_UP_LEAD_MS)),
      setTimeout(() => void this.end('TIME_LIMIT'), this.deps.maxDurationMs),
      setInterval(() => this.logSys({ kind: 'media_stats', ...media.stats() }), STATS_LOG_INTERVAL_MS),
    );
    this.logSys({ kind: 'started', maxDurationMs: this.deps.maxDurationMs });
  }

  markMediaReady(): void {
    if (this.greeted || this.isEnded) return;
    this.greeted = true;
    this.status = 'ACTIVE';
    this.cue(this.deps.greetingCue, true);
  }

  async end(reason: PocEndReason): Promise<void> {
    if (this.isEnded) return;
    this.status = reason === 'ERROR' ? 'FAILED' : 'ENDED';
    this.endReason = reason;
    this.endedAt = this.now();
    for (const t of this.timers) clearTimeout(t);
    this.transcript.finalizeAll();
    this.logSys({ kind: 'ending', reason, usage: this.usage, media: this.deps.media.stats() });

    this.deps.media.sendControl({ type: 'call.ended', reason });
    this.deps.live.close();
    try {
      await this.deps.media.close();
    } catch (err) {
      this.deps.onError?.(`media close failed for ${this.callId}: ${(err as Error).message}`);
    }
    this.deps.log.close();
    this.deps.onEnded?.(this);
  }

  snapshot(): PocTranscriptResponse {
    return {
      callId: this.callId,
      status: this.status,
      endReason: this.endReason,
      durationMs: this.endedAt === null ? null : Math.round(this.endedAt - this.startedAt),
      turns: this.transcript.turns(),
    };
  }

  private handleLive(e: GeminiEvent, raw: unknown): void {
    const t = this.elapsed();
    if (e.type !== 'ai.audio') this.deps.log.write({ t: Math.round(t), dir: 'in', event: raw });
    switch (e.type) {
      case 'ai.audio':
        this.transcript.aiOutput(t);
        this.deps.media.playAiPcm(e.pcm24k);
        break;
      case 'ai.transcript':
        this.transcript.aiText(e.text, t);
        break;
      case 'user.transcript':
        this.transcript.userText(e.text, t);
        break;
      case 'interrupted':
        // Barge-in: stop playing what the AI had queued, right now.
        this.deps.media.clearPlayback();
        this.transcript.interrupted();
        break;
      case 'turn_complete':
        this.deps.media.aiTurnEnded();
        this.transcript.turnComplete();
        break;
      case 'usage':
        addUsage(this.usage, e.usage);
        break;
      case 'go_away':
        this.deps.onError?.(`Gemini goAway on ${this.callId} (timeLeft=${e.timeLeft})`);
        break;
      case 'setup_complete':
        break;
    }
  }

  private cue(text: string, turnComplete: boolean): void {
    if (this.isEnded) return;
    this.deps.live.sendCue(text, turnComplete);
    this.deps.log.write({ t: Math.round(this.elapsed()), dir: 'out', event: { cue: text, turnComplete } });
  }

  private updateFloor(): void {
    const floor: Floor = this.aiPlaying ? 'ai' : this.userSpeaking ? 'user' : 'none';
    if (floor === this.floor) return;
    this.floor = floor;
    this.deps.media.sendControl({ type: 'floor', floor });
  }

  private elapsed(): number {
    return this.now() - this.startedAt;
  }

  private logSys(event: Record<string, unknown>): void {
    this.deps.log.write({ t: Math.round(this.elapsed()), dir: 'sys', event });
  }
}
