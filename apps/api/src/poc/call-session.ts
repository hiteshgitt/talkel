import type { PocCallStatus, PocEndReason, PocTranscriptResponse } from '@speakai/contracts';
import { normalizeRealtimeEvent, type RealtimeEvent } from '../realtime/realtime-events.js';
import type { SidebandConnection } from '../realtime/sideband.js';
import { TranscriptAssembler } from '../realtime/transcript-assembler.js';
import { addUsage, type CallEventLog, emptyUsage, type LiveCall } from './live-call.js';

export type { CallEventLog } from './live-call.js';

export interface CallSessionDeps {
  callId: string;
  sideband: SidebandConnection;
  hangup: (callId: string) => Promise<void>;
  log: CallEventLog;
  maxDurationMs: number;
  /** Full instructions with the wrap-up note appended, sent ~60 s before the hard stop. */
  wrapUpInstructions: string;
  now?: () => number;
  onEnded?: (session: CallSession) => void;
  onError?: (message: string) => void;
}

const WRAP_UP_LEAD_MS = 60_000;

/**
 * OpenAI Realtime variant (media device ⇄ OpenAI over WebRTC, control via sideband).
 * Owns one live POC call: consumes sideband events, builds the transcript, enforces the
 * time limit and ends the call exactly once. Deliberately free of Nest/DI so it is unit-testable.
 */
export class CallSession implements LiveCall {
  private readonly now: () => number;
  private readonly startedAt: number;
  private readonly transcript = new TranscriptAssembler();
  private readonly timers: NodeJS.Timeout[] = [];
  private status: PocCallStatus = 'CONNECTING';
  private endReason: PocEndReason | null = null;
  private endedAt: number | null = null;
  private greeted = false;
  readonly usage = emptyUsage();

  constructor(private readonly deps: CallSessionDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.startedAt = this.now();
  }

  get callId(): string {
    return this.deps.callId;
  }

  get isEnded(): boolean {
    return this.status === 'ENDED' || this.status === 'FAILED';
  }

  start(): void {
    this.deps.sideband.onMessage((raw) => this.handleRaw(raw));
    this.deps.sideband.onClose((code, reason) => {
      this.logSys({ kind: 'sideband_closed', code, reason });
      void this.end('PROVIDER_CLOSED');
    });

    const { maxDurationMs } = this.deps;
    this.timers.push(
      setTimeout(() => this.sendWrapUp(), Math.max(0, maxDurationMs - WRAP_UP_LEAD_MS)),
      setTimeout(() => void this.end('TIME_LIMIT'), maxDurationMs),
    );
    this.logSys({ kind: 'started', maxDurationMs });
  }

  /**
   * Called when the device reports its media is flowing (data channel open). Only then do we
   * ask the AI to speak first, so its greeting isn't lost before audio is established.
   */
  markMediaReady(): void {
    if (this.greeted || this.isEnded) return;
    this.greeted = true;
    this.status = 'ACTIVE';
    this.send({ type: 'response.create' });
  }

  async end(reason: PocEndReason): Promise<void> {
    if (this.isEnded) return;
    this.status = reason === 'ERROR' ? 'FAILED' : 'ENDED';
    this.endReason = reason;
    this.endedAt = this.now();
    for (const t of this.timers) clearTimeout(t);
    this.logSys({ kind: 'ending', reason, usage: this.usage });

    try {
      await this.deps.hangup(this.deps.callId);
    } catch (err) {
      this.deps.onError?.(`hangup failed for ${this.deps.callId}: ${(err as Error).message}`);
    }
    if (this.deps.sideband.isOpen) this.deps.sideband.close();
    this.deps.log.close();
    this.deps.onEnded?.(this);
  }

  snapshot(): PocTranscriptResponse {
    return {
      callId: this.deps.callId,
      status: this.status,
      endReason: this.endReason,
      durationMs: this.endedAt === null ? null : Math.round(this.endedAt - this.startedAt),
      turns: this.transcript.turns(),
    };
  }

  private elapsed(): number {
    return this.now() - this.startedAt;
  }

  private send(event: Record<string, unknown>): void {
    this.deps.sideband.send(event);
    this.deps.log.write({ t: Math.round(this.elapsed()), dir: 'out', event });
  }

  private logSys(event: Record<string, unknown>): void {
    this.deps.log.write({ t: Math.round(this.elapsed()), dir: 'sys', event });
  }

  private sendWrapUp(): void {
    if (this.isEnded) return;
    this.send({ type: 'session.update', session: { type: 'realtime', instructions: this.deps.wrapUpInstructions } });
  }

  private handleRaw(raw: unknown): void {
    const t = this.elapsed();
    this.deps.log.write({ t: Math.round(t), dir: 'in', event: redactAudio(raw) });
    const event = normalizeRealtimeEvent(raw);
    if (event) this.apply(event, t);
  }

  private apply(e: RealtimeEvent, t: number): void {
    const tx = this.transcript;
    switch (e.type) {
      case 'user.speech_started':
        tx.userSpeechStarted(e.itemId, t);
        break;
      case 'user.transcript':
        tx.userTranscript(e.itemId, e.text, t);
        break;
      case 'user.transcript_failed':
        tx.userTranscriptFailed(e.itemId, t);
        break;
      case 'ai.item_added':
        tx.aiItemAdded(e.itemId, e.responseId, t);
        break;
      case 'ai.transcript_delta':
        tx.aiTranscriptDelta(e.itemId, e.delta, t);
        break;
      case 'ai.transcript_done':
        tx.aiTranscriptDone(e.itemId, e.text, t);
        break;
      case 'ai.item_truncated':
        tx.aiItemTruncated(e.itemId);
        break;
      case 'ai.response_done':
        tx.responseDone(e.responseId, e.status);
        if (e.usage) addUsage(this.usage, e.usage);
        break;
      case 'error':
        this.deps.onError?.(`provider error on ${this.deps.callId}: ${e.code} ${e.message}`);
        break;
      case 'session.ready':
      case 'user.speech_stopped':
      case 'ai.audio_started':
      case 'ai.audio_stopped':
        break; // timing-only; captured in the raw log for the latency report
    }
  }
}


/** Audio payloads (base64) would bloat logs and are never needed for analysis. */
function redactAudio(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const r = raw as Record<string, unknown>;
  const type = typeof r.type === 'string' ? r.type : '';
  if ((type.endsWith('audio.delta') || type === 'input_audio_buffer.append') && typeof r.delta === 'string') {
    return { ...r, delta: `[${r.delta.length} b64 chars]` };
  }
  return raw;
}
