import type { EndReason, TranscriptTurn } from '@speakai/contracts';
import type { ToolOutcome } from '../engine/tools.js';
import type { GeminiEvent } from '../gemini/gemini-events.js';
import type { LiveSession } from '../gemini/gemini-live.js';
import { TurnTranscript } from '../gemini/turn-transcript.js';
import { SpeechLevelDetector } from '../media/pcm.js';
import type { MediaEndpoint, MediaStats } from '../media/webrtc-endpoint.js';
import { addUsage, type CallEventLog, emptyUsage } from '../realtime/usage.js';
import type { CallRecorder, RecordingResult } from '../recording/call-recorder.js';
import type { RealtimeUsage } from '../realtime/realtime-events.js';

export type LiveStatus = 'CONNECTING' | 'ACTIVE' | 'RECONNECTING' | 'ENDED' | 'FAILED';

export interface LiveSnapshot {
  status: LiveStatus;
  endReason: EndReason | null;
  /** Wall-clock start (media ready) and duration, for persistence. */
  startedAt: Date | null;
  durationMs: number | null;
  turns: TranscriptTurn[];
  goalsAchieved: string[];
  stateChanges: Record<string, string | number>;
  usage: RealtimeUsage;
  media: MediaStats | null;
  /** Timing measured live, for fluency feedback (text alone can't give these). */
  liveMetrics: { userSpeakingMs: number; responseLatenciesMs: number[] };
  /** Recording state: `result` is set once the file is finalised (call ended). */
  recording: { active: boolean; started: boolean; result: RecordingResult | null };
}

export interface LiveConversationDeps {
  id: string;
  media: MediaEndpoint;
  live: LiveSession;
  log: CallEventLog;
  maxDurationMs: number;
  openingCue: string;
  wrapUpCue: string;
  handleTool: (name: string, args: unknown) => ToolOutcome;
  onFlush?: (s: LiveSnapshot) => void;
  onStatus?: (status: LiveStatus) => void;
  onEvent?: (type: string, atMs: number, payload?: Record<string, unknown>) => void;
  onEnded?: (s: LiveSnapshot) => void;
  onError?: (message: string) => void;
  /** Creates the recorder the first time the user starts recording. */
  createRecorder?: () => Promise<CallRecorder>;
  now?: () => number;
  reconnectGraceMs?: number;
  flushIntervalMs?: number;
}

const WRAP_UP_LEAD_MS = 60_000;
/** The AI may not end a call before this much time and this many user turns (prevents premature hang-ups). */
const MIN_CALL_MS_BEFORE_AI_END = 45_000;
const MIN_USER_TURNS_BEFORE_AI_END = 2;
type Floor = 'none' | 'user' | 'ai';

/**
 * One live conversation: phone ⇄ our WebRTC endpoint ⇄ Gemini Live. The server is in the media
 * path, so it owns barge-in, timing, tools, transcripts, reconnection and ending. No DB access here:
 * persistence happens through the onFlush/onEnded callbacks.
 */
export class LiveConversation {
  readonly usage = emptyUsage();
  private readonly now: () => number;
  private readonly createdAt: number;
  private startedAtWall: Date | null = null;
  private startedAtMono: number | null = null;
  private media: MediaEndpoint;
  private readonly transcript = new TurnTranscript();
  private readonly vad = new SpeechLevelDetector();
  private readonly timers: NodeJS.Timeout[] = [];
  private graceTimer: NodeJS.Timeout | null = null;
  private status: LiveStatus = 'CONNECTING';
  private endReason: EndReason | null = null;
  private endedAtMono: number | null = null;
  private readonly goals = new Set<string>();
  private readonly stateChanges: Record<string, string | number> = {};
  private floor: Floor = 'none';
  private userSpeaking = false;
  private aiPlaying = false;
  private endScheduled = false;
  private recorder: CallRecorder | null = null;
  private recorderPending: Promise<CallRecorder> | null = null;
  private recordingResult: RecordingResult | null = null;
  // Live timing (monotonic ms): user speech time and how fast the user answers after the AI stops.
  private userSpeakingMs = 0;
  private userSpeechStartedAt: number | null = null;
  private aiStoppedAt: number | null = null;
  private readonly responseLatenciesMs: number[] = [];

  constructor(private readonly deps: LiveConversationDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.createdAt = this.now();
    this.media = deps.media;
  }

  get id(): string {
    return this.deps.id;
  }

  get currentStatus(): LiveStatus {
    return this.status;
  }

  get isEnded(): boolean {
    return this.status === 'ENDED' || this.status === 'FAILED';
  }

  get goalsAchieved(): ReadonlySet<string> {
    return this.goals;
  }

  start(): void {
    this.attachMedia(this.media);
    const { live } = this.deps;
    live.onEvent((e, raw) => this.handleLive(e, raw));
    live.onClose((code, reason) => {
      this.logSys({ kind: 'provider_closed', code, reason });
      if (!this.isEnded) {
        this.deps.onError?.(`provider closed ${this.id}: ${code} ${reason}`);
        void this.end('PROVIDER_CLOSED');
      }
    });

    const { maxDurationMs } = this.deps;
    const wrapAt = maxDurationMs >= 2 * WRAP_UP_LEAD_MS ? maxDurationMs - WRAP_UP_LEAD_MS : maxDurationMs / 2;
    this.timers.push(
      setTimeout(() => {
        this.cue(this.deps.wrapUpCue, false);
        this.media.sendControl({ type: 'time_warning', secondsRemaining: Math.round((maxDurationMs - wrapAt) / 1000) });
        this.deps.onEvent?.('WRAP_UP', this.elapsedMs());
      }, wrapAt),
      setTimeout(() => void this.end('TIME_LIMIT'), maxDurationMs),
      setInterval(() => this.deps.onFlush?.(this.snapshot()), this.deps.flushIntervalMs ?? 10_000),
      setInterval(() => this.logSys({ kind: 'media_stats', ...this.media.stats() }), 10_000),
      setInterval(() => this.recorder?.tick(this.now()), 200),
    );
    this.logSys({ kind: 'started', maxDurationMs });
  }

  /** The phone's media is up: the AI opens the conversation. */
  markMediaReady(): void {
    if (this.startedAtMono !== null || this.isEnded) return;
    this.startedAtMono = this.now();
    this.startedAtWall = new Date();
    this.setStatus('ACTIVE');
    this.cue(this.deps.openingCue, true);
    this.deps.onEvent?.('READY', this.elapsedMs());
  }

  /** The phone rejoined after a network drop: swap in the new media endpoint, keep the AI session. */
  replaceMedia(next: MediaEndpoint): void {
    if (this.isEnded) {
      void next.close();
      return;
    }
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
    const old = this.media;
    this.media = next;
    this.attachMedia(next);
    void old.close();
    this.setStatus('ACTIVE');
    this.logSys({ kind: 'reconnected' });
    this.deps.onEvent?.('RECONNECTED', this.elapsedMs());
  }

  /** User-controlled call recording (both voices). Pausing leaves the paused time out of the file. */
  async setRecording(on: boolean): Promise<boolean> {
    if (this.isEnded) throw new Error('conversation has ended');
    if (on) {
      if (!this.recorder) {
        if (!this.deps.createRecorder) throw new Error('recording is not available');
        this.recorderPending ??= this.deps.createRecorder();
        this.recorder = await this.recorderPending;
      }
      this.recorder.resume(this.now());
    } else {
      this.recorder?.pause();
    }
    const active = this.recorder?.recording ?? false;
    this.media.sendControl({ type: 'recording', on: active });
    this.deps.onEvent?.(active ? 'RECORDING_ON' : 'RECORDING_OFF', this.elapsedMs());
    return active;
  }

  elapsedMs(): number {
    return Math.round(this.now() - (this.startedAtMono ?? this.createdAt));
  }

  async end(reason: EndReason): Promise<void> {
    if (this.isEnded) return;
    this.endReason = reason;
    this.endedAtMono = this.now();
    this.setStatus(reason === 'ERROR' ? 'FAILED' : 'ENDED');
    for (const t of this.timers) clearTimeout(t);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.transcript.finalizeAll();
    this.logSys({ kind: 'ending', reason, usage: this.usage, media: this.media.stats() });
    this.deps.onEvent?.('ENDED', this.elapsedMs(), { reason });

    this.media.sendControl({ type: 'call.ended', reason });
    this.deps.live.close();
    if (this.recorder) {
      try {
        this.recordingResult = await this.recorder.finish();
      } catch (err) {
        this.deps.onError?.(`recording finalise failed for ${this.id}: ${(err as Error).message}`);
      }
    }
    try {
      await this.media.close();
    } catch (err) {
      this.deps.onError?.(`media close failed for ${this.id}: ${(err as Error).message}`);
    }
    this.deps.log.close();
    this.deps.onEnded?.(this.snapshot());
  }

  snapshot(): LiveSnapshot {
    const durationMs =
      this.startedAtMono === null
        ? this.isEnded
          ? 0
          : null
        : Math.round((this.endedAtMono ?? this.now()) - this.startedAtMono);
    return {
      status: this.status,
      endReason: this.endReason,
      startedAt: this.startedAtWall,
      durationMs,
      turns: this.transcript.turns(),
      goalsAchieved: [...this.goals],
      stateChanges: { ...this.stateChanges },
      usage: { ...this.usage },
      media: this.media.stats(),
      recording: { active: this.recorder?.recording ?? false, started: this.recorder !== null, result: this.recordingResult },
      liveMetrics: {
        userSpeakingMs:
          this.userSpeakingMs + (this.userSpeechStartedAt !== null ? Math.max(0, (this.endedAtMono ?? this.now()) - this.userSpeechStartedAt) : 0),
        responseLatenciesMs: [...this.responseLatenciesMs],
      },
    };
  }

  // ───────────── internals ─────────────

  private attachMedia(media: MediaEndpoint): void {
    const current = () => media === this.media && !this.isEnded;

    media.onUserPcm((pcm) => {
      if (!current()) return;
      this.deps.live.sendUserAudio(pcm);
      this.recorder?.addUser(pcm, this.now());
      const edge = this.vad.push(pcm);
      if (edge === 'start') {
        this.userSpeaking = true;
        this.userSpeechStartedAt = this.now();
        // Only count answers that start after the AI finished (not barge-ins, not the very first line).
        if (this.aiStoppedAt !== null && !this.aiPlaying) this.responseLatenciesMs.push(Math.round(this.now() - this.aiStoppedAt));
        this.aiStoppedAt = null;
        this.transcript.userSpeechStarted(this.elapsedMs());
      } else if (edge === 'stop') {
        this.userSpeaking = false;
        if (this.userSpeechStartedAt !== null) this.userSpeakingMs += Math.max(0, this.now() - this.userSpeechStartedAt);
        this.userSpeechStartedAt = null;
      }
      if (edge) this.updateFloor();
    });
    media.onAiFrame((pcm) => {
      if (current()) this.recorder?.addAi(pcm, this.now());
    });
    media.onPlayback((state) => {
      if (!current()) return;
      this.aiPlaying = state === 'started';
      if (state === 'stopped' && !this.userSpeaking) this.aiStoppedAt = this.now();
      if (state === 'started') this.aiStoppedAt = null;
      this.updateFloor();
    });
    media.onClosed((reason) => {
      if (!current()) return;
      this.logSys({ kind: 'media_closed', reason });
      this.setStatus('RECONNECTING');
      this.deps.onEvent?.('MEDIA_LOST', this.elapsedMs(), { reason });
      this.graceTimer = setTimeout(() => void this.end('CONNECTION_LOST'), this.deps.reconnectGraceMs ?? 20_000);
    });
  }

  private handleLive(e: GeminiEvent, raw: unknown): void {
    const t = this.elapsedMs();
    if (e.type !== 'ai.audio') this.deps.log.write({ t, dir: 'in', event: raw });
    switch (e.type) {
      case 'ai.audio':
        this.transcript.aiOutput(t);
        this.media.playAiPcm(e.pcm24k);
        break;
      case 'ai.transcript':
        this.transcript.aiText(e.text, t);
        break;
      case 'user.transcript':
        this.transcript.userText(e.text, t);
        break;
      case 'interrupted':
        this.media.clearPlayback();
        this.transcript.interrupted();
        break;
      case 'turn_complete':
        this.media.aiTurnEnded();
        this.transcript.turnComplete();
        break;
      case 'usage':
        addUsage(this.usage, e.usage);
        break;
      case 'tool_call':
        this.handleToolCalls(e.calls, t);
        break;
      case 'go_away':
        this.deps.onError?.(`provider goAway on ${this.id} (timeLeft=${e.timeLeft})`);
        break;
      case 'setup_complete':
        break;
    }
  }

  private handleToolCalls(calls: Array<{ id: string; name: string; args: unknown }>, t: number): void {
    const responses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];
    for (const call of calls) {
      let outcome = this.deps.handleTool(call.name, call.args);
      if (outcome.endRequested && !this.mayAiEndNow()) {
        outcome = { response: { ok: false, error: 'Too early to end the call. Keep the conversation going naturally.' } };
      }
      if (outcome.goalAchieved) this.goals.add(outcome.goalAchieved);
      if (outcome.stateChanges) Object.assign(this.stateChanges, outcome.stateChanges);
      if (outcome.endRequested) this.endAfterAiFinishes(outcome.endRequested);
      this.deps.onEvent?.('TOOL_CALL', t, { name: call.name, args: call.args as Record<string, unknown>, response: outcome.response });
      responses.push({ id: call.id, name: call.name, response: outcome.response });
    }
    this.deps.live.sendToolResponses(responses);
  }

  private mayAiEndNow(): boolean {
    const userTurns = this.transcript.turns().filter((x) => x.speaker === 'USER').length;
    return this.elapsedMs() >= MIN_CALL_MS_BEFORE_AI_END && userTurns >= MIN_USER_TURNS_BEFORE_AI_END;
  }

  /** Let the AI's goodbye play out before hanging up (max ~10 s). */
  private endAfterAiFinishes(reason: 'OBJECTIVE_COMPLETED' | 'AI_NATURAL_END'): void {
    if (this.endScheduled) return;
    this.endScheduled = true;
    const started = this.now();
    let quietSince: number | null = null;
    const check = setInterval(() => {
      const t = this.now();
      if (this.aiPlaying) quietSince = null;
      else quietSince ??= t;
      if ((quietSince !== null && t - quietSince >= 1200) || t - started > 10_000) {
        clearInterval(check);
        void this.end(reason);
      }
    }, 200);
    this.timers.push(check);
  }

  private cue(text: string, turnComplete: boolean): void {
    if (this.isEnded) return;
    this.deps.live.sendCue(text, turnComplete);
    this.deps.log.write({ t: this.elapsedMs(), dir: 'out', event: { cue: text, turnComplete } });
  }

  private setStatus(status: LiveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.deps.onStatus?.(status);
  }

  private updateFloor(): void {
    const floor: Floor = this.aiPlaying ? 'ai' : this.userSpeaking ? 'user' : 'none';
    if (floor === this.floor) return;
    this.floor = floor;
    this.media.sendControl({ type: 'floor', floor });
  }

  private logSys(event: Record<string, unknown>): void {
    this.deps.log.write({ t: this.elapsedMs(), dir: 'sys', event });
  }
}
