import type { EndReason, LiveTokenResponse } from '@speakai/contracts';
import { DeviceEventEmitter, type EmitterSubscription, PermissionsAndroid, Platform } from 'react-native';
import type InCallManagerType from 'react-native-incall-manager';
import { TalkelAudio } from '../../modules/talkel-audio/src';
import { api, friendlyError } from '@/lib/api';
import { nativeCallingProblem } from '@/lib/runtime';
import { TurnTranscript } from './turn-transcript';

export type CallPhase = 'connecting' | 'active' | 'reconnecting' | 'ending' | 'ended' | 'failed';
/** Who is audibly "holding the floor" right now — drives the listening/speaking indicator. */
export type Floor = 'none' | 'user' | 'ai';

/** Where call audio plays (InCallManager's Android device names). */
export type AudioRoute = 'EARPIECE' | 'SPEAKER_PHONE' | 'WIRED_HEADSET' | 'BLUETOOTH';
const ROUTE_ORDER: AudioRoute[] = ['BLUETOOTH', 'WIRED_HEADSET', 'EARPIECE', 'SPEAKER_PHONE'];

export interface CallState {
  phase: CallPhase;
  floor: Floor;
  muted: boolean;
  /** Current audio output, and the outputs available right now (a headset appears when connected). */
  audioRoute: AudioRoute;
  audioRoutes: AudioRoute[];
  connectedAt: number | null;
  /** Seconds left when the one-minute warning is due. */
  warningSecondsLeft: number | null;
  /** Call recording isn't available for direct calls yet. */
  canRecord: boolean;
  recording: boolean;
  recordingError: string | null;
  error: string | null;
}

type Listener = (state: CallState) => void;

/** Rejoin attempts stop after this long (the server closes a silent call after ~75 s). */
const RECONNECT_WINDOW_MS = 30_000;
const WRAP_UP_LEAD_MS = 60_000;
/** How often the accent/persona reminder is due during a call. */
const STYLE_CUE_EVERY_MS = 150_000;
/** The AI may not end a call before this much time and this many user turns (prevents premature hang-ups). */
const MIN_CALL_MS_BEFORE_AI_END = 45_000;
const MIN_USER_TURNS_BEFORE_AI_END = 2;
/** Transcript save + heartbeat. */
const PROGRESS_EVERY_MS = 10_000;

/** Energy-based speech detection on the mic level, for the speaking indicator and turn timing only. */
class SpeechLevel {
  private speaking = false;
  private loudMs = 0;
  private quietMs = 0;
  push(level: number, ms: number): 'start' | 'stop' | null {
    if (level >= 0.02) {
      this.loudMs += ms;
      this.quietMs = 0;
    } else {
      this.quietMs += ms;
      this.loudMs = 0;
    }
    if (!this.speaking && this.loudMs >= 60) {
      this.speaking = true;
      return 'start';
    }
    if (this.speaking && this.quietMs >= 500) {
      this.speaking = false;
      return 'stop';
    }
    return null;
  }
}

interface GeminiMessage {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
  toolCall?: { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] };
  usageMetadata?: {
    promptTokenCount?: number;
    responseTokenCount?: number;
    cachedContentTokenCount?: number;
    promptTokensDetails?: { modality?: string; tokenCount?: number }[];
    responseTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
  goAway?: unknown;
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
}

/** Transcription placeholders such as "<noise>" are markers, not speech. */
const clean = (text: string | undefined) => (text ?? '').replace(/<[^<>]{1,40}>/g, '');

/**
 * One voice conversation. The phone talks to Gemini Live directly over a WebSocket, with a
 * single-use token from our server that carries the whole setup (prompt, voice, tools). Tools run
 * on our server; the transcript and timing are kept here and saved when the call ends. If the
 * connection drops, a new token resumes the same AI session. Framework-free so the React layer stays thin.
 */
export class RealtimeCall {
  private state: CallState = {
    phase: 'connecting',
    floor: 'none',
    muted: false,
    audioRoute: 'EARPIECE',
    audioRoutes: ['EARPIECE', 'SPEAKER_PHONE'],
    connectedAt: null,
    warningSecondsLeft: null,
    canRecord: false,
    recording: false,
    recordingError: null,
    error: null,
  };
  private readonly listeners = new Set<Listener>();
  private incall: typeof InCallManagerType | null = null;
  private subs: { remove(): void }[] = [];
  private routeSub: EmitterSubscription | null = null;
  private ws: WebSocket | null = null;
  private live: LiveTokenResponse | null = null;
  private resumeHandle: string | null = null;
  private setupDone = false;
  private reconnecting = false;
  private closed = false;
  private finished = false;
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  // Conversation bookkeeping (what the server did when it was in the media path).
  private readonly transcript = new TurnTranscript();
  private readonly vad = new SpeechLevel();
  private startedAt: number | null = null;
  private userSpeaking = false;
  private aiPlaying = false;
  private userSpeakingMs = 0;
  private userSpeechStartedAt: number | null = null;
  private aiStoppedAt: number | null = null;
  private readonly responseLatenciesMs: number[] = [];
  private lastStyleCueAt = 0;
  private endScheduled = false;
  private readonly usage = { inputAudioTokens: 0, outputAudioTokens: 0, inputTextTokens: 0, outputTextTokens: 0, cachedInputTokens: 0 };

  constructor(readonly conversationId: string) {}

  getState(): CallState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const problem = nativeCallingProblem() ?? (TalkelAudio ? null : 'Please install the latest Talkel app to make calls.');
    if (problem) {
      this.fail(problem);
      return;
    }
    try {
      if (!(await requestMicPermission())) {
        this.fail('Talkel needs microphone access for calls. Allow it in Settings.');
        return;
      }
      // Loaded lazily: the native module only exists in our own builds.
      this.incall = (await import('react-native-incall-manager')).default;
      // Android 12+ only routes to a Bluetooth headset with the "Nearby devices" permission, and it
      // must be granted before the audio manager starts. Refusing is fine: earpiece/speaker still work.
      await requestBluetoothPermission();
      this.routeSub = DeviceEventEmitter.addListener('onAudioDeviceChanged', (e: { availableAudioDeviceList?: string; selectedAudioDevice?: string }) =>
        this.onAudioDevices(e),
      );
      // Phone-call audio mode: a connected headset first, else the earpiece; proximity handling.
      this.incall.start({ media: 'audio' });
      this.incall.setForceSpeakerphoneOn(false);

      this.live = await api.liveToken(this.conversationId, {});
      if (this.closed) return;
      await TalkelAudio!.start();
      this.subs.push(
        TalkelAudio!.addListener('onMic', (e) => this.onMic(e.data, e.level)),
        TalkelAudio!.addListener('onPlayback', (e) => this.onPlayback(e.state)),
      );
      this.openSocket(this.live.url);
    } catch (err) {
      if (!this.closed) this.fail(friendlyError(err));
    }
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    // Tell the AI the user stopped talking, so a half-finished sentence doesn't hang.
    if (muted) this.send({ realtimeInput: { audioStreamEnd: true } });
    this.set({ muted });
  }

  /** Cycles through the available outputs (e.g. Bluetooth → phone → speaker). */
  nextAudioRoute(): void {
    const routes = this.state.audioRoutes;
    const next = routes[(routes.indexOf(this.state.audioRoute) + 1) % routes.length];
    if (!next || !this.incall) return;
    this.set({ audioRoute: next }); // optimistic; the device event confirms
    void this.incall.chooseAudioRoute(next).catch(() => undefined);
  }

  async toggleRecording(): Promise<void> {
    this.set({ recordingError: 'Recording isn’t available for calls yet.' });
  }

  /** User hangs up. */
  async hangUp(): Promise<void> {
    await this.finish('USER_ENDED');
  }

  // ───────────── connection ─────────────

  private openSocket(url: string): void {
    const ws = new WebSocket(url);
    this.ws = ws;
    this.setupDone = false;
    ws.onopen = () => {
      // The token carries the real setup; the model name is all the endpoint needs from us.
      if (ws === this.ws) ws.send(JSON.stringify({ setup: { model: this.live!.model } }));
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws || typeof e.data !== 'string') return;
      let message: GeminiMessage;
      try {
        message = JSON.parse(e.data) as GeminiMessage;
      } catch {
        return; // ignore malformed frames
      }
      this.onMessage(message);
    };
    ws.onclose = () => {
      if (ws !== this.ws || this.closed) return;
      this.ws = null;
      if (this.startedAt === null) this.fail('The AI voice service could not start the call');
      else void this.rejoin();
    };
  }

  private onSetupComplete(): void {
    this.setupDone = true;
    if (this.startedAt !== null) {
      // Resumed after a drop: the AI still has the conversation.
      this.set({ phase: 'active', error: null });
      return;
    }
    this.startedAt = Date.now();
    this.set({ phase: 'active', connectedAt: this.startedAt });
    void api.ready(this.conversationId).catch(() => undefined);
    this.cue(this.live!.openingCue, true); // the AI opens the conversation
    this.startTimers();
  }

  /** Re-joins the same AI session with a fresh token (network drop, or the provider's goAway). */
  private async rejoin(): Promise<void> {
    if (this.closed || this.reconnecting) return;
    if (!this.resumeHandle) {
      void this.finish('PROVIDER_CLOSED', 'The call was interrupted');
      return;
    }
    this.reconnecting = true;
    this.set({ phase: 'reconnecting' });
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.setupDone = false;
    TalkelAudio?.clear();
    const deadline = Date.now() + RECONNECT_WINDOW_MS;
    while (!this.closed && Date.now() < deadline) {
      try {
        const live = await api.liveToken(this.conversationId, { resumeHandle: this.resumeHandle });
        if (this.closed) return;
        this.reconnecting = false;
        // setupComplete flips us back to "active"; if this socket dies too, onclose → rejoin again.
        this.openSocket(live.url);
        return;
      } catch (err) {
        if (friendlyError(err).includes('already ended')) break;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    this.reconnecting = false;
    if (!this.closed) void this.finish('CONNECTION_LOST', 'Connection lost');
  }

  // ───────────── audio & AI events ─────────────

  private onMic(data: string, level: number): void {
    if (this.closed || !this.setupDone || this.startedAt === null) return;
    if (!this.state.muted) {
      this.send({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data } } });
    }
    const edge = this.vad.push(this.state.muted ? 0 : level, 40);
    const now = Date.now();
    if (edge === 'start') {
      this.userSpeaking = true;
      this.userSpeechStartedAt = now;
      // Only count answers that start after the AI finished (not barge-ins, not the very first line).
      if (this.aiStoppedAt !== null && !this.aiPlaying) this.responseLatenciesMs.push(now - this.aiStoppedAt);
      this.aiStoppedAt = null;
      this.transcript.userSpeechStarted(this.elapsed());
    } else if (edge === 'stop') {
      this.userSpeaking = false;
      if (this.userSpeechStartedAt !== null) this.userSpeakingMs += now - this.userSpeechStartedAt;
      this.userSpeechStartedAt = null;
    }
    if (edge) this.updateFloor();
  }

  private onPlayback(state: 'started' | 'stopped'): void {
    this.aiPlaying = state === 'started';
    if (state === 'stopped' && !this.userSpeaking) this.aiStoppedAt = Date.now();
    if (state === 'started') this.aiStoppedAt = null;
    this.updateFloor();
  }

  private onMessage(m: GeminiMessage): void {
    if (m.setupComplete) this.onSetupComplete();
    const t = this.elapsed();
    const sc = m.serverContent;
    if (sc) {
      const userText = clean(sc.inputTranscription?.text);
      if (userText.trim()) this.transcript.userText(userText, t);
      for (const part of sc.modelTurn?.parts ?? []) {
        const d = part.inlineData;
        if (d?.data && (d.mimeType ?? '').startsWith('audio/pcm')) {
          this.transcript.aiOutput(t);
          TalkelAudio?.play(d.data);
        }
      }
      const aiText = clean(sc.outputTranscription?.text);
      if (aiText.trim()) this.transcript.aiText(aiText, t);
      if (sc.interrupted) {
        TalkelAudio?.clear();
        this.transcript.interrupted();
      }
      if (sc.turnComplete) this.transcript.turnComplete();
    }
    if (m.usageMetadata) this.addUsage(m.usageMetadata);
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) this.resumeHandle = m.sessionResumptionUpdate.newHandle;
    if (m.toolCall?.functionCalls?.length) void this.runTools(m.toolCall.functionCalls);
    // The provider is about to close this connection: move to a new one now.
    if (m.goAway) void this.rejoin();
  }

  private async runTools(calls: { id: string; name: string; args?: Record<string, unknown> }[]): Promise<void> {
    const responses = await Promise.all(
      calls.map(async (call) => {
        let response: Record<string, unknown>;
        try {
          const outcome = await api.liveTool(this.conversationId, { name: call.name, args: call.args ?? {} });
          response = outcome.response;
          if (outcome.endRequested) {
            if (this.mayAiEndNow()) this.endAfterAiFinishes(outcome.endRequested);
            else response = { ok: false, error: 'Too early to end the call. Keep the conversation going naturally.' };
          }
        } catch {
          response = { ok: false, error: 'Tool unavailable right now. Carry on naturally.' };
        }
        // SILENT: the model uses the result without an extra spoken turn.
        return { id: call.id, name: call.name, response: { ...response, scheduling: 'SILENT' } };
      }),
    );
    this.send({ toolResponse: { functionResponses: responses } });
  }

  private mayAiEndNow(): boolean {
    const userTurns = this.transcript.turns().filter((x) => x.speaker === 'USER').length;
    if (this.live?.endPolicy === 'single_answer') return userTurns >= 1;
    return this.elapsed() >= MIN_CALL_MS_BEFORE_AI_END && userTurns >= MIN_USER_TURNS_BEFORE_AI_END;
  }

  /** Let the AI's goodbye play out before hanging up (max ~10 s). */
  private endAfterAiFinishes(reason: 'OBJECTIVE_COMPLETED' | 'AI_NATURAL_END'): void {
    if (this.endScheduled) return;
    this.endScheduled = true;
    const started = Date.now();
    let quietSince: number | null = null;
    const check = setInterval(() => {
      const now = Date.now();
      if (this.aiPlaying) quietSince = null;
      else quietSince ??= now;
      if ((quietSince !== null && now - quietSince >= 1200) || now - started > 10_000) {
        clearInterval(check);
        void this.finish(reason);
      }
    }, 200);
    this.timers.push(check);
  }

  private startTimers(): void {
    const live = this.live!;
    const maxMs = live.durationSec * 1000;
    const wrapAt = maxMs >= 2 * WRAP_UP_LEAD_MS ? maxMs - WRAP_UP_LEAD_MS : maxMs / 2;
    this.timers.push(
      setTimeout(() => {
        if (!live.wrapUpCue) return;
        this.cue(live.wrapUpCue, false);
        this.set({ warningSecondsLeft: Math.round((maxMs - wrapAt) / 1000) });
      }, wrapAt),
      setTimeout(() => void this.finish('TIME_LIMIT'), maxMs),
      // Accent/persona reminder: due every few minutes, sent at the first moment the AI isn't speaking.
      setInterval(() => {
        if (!live.styleCue || this.aiPlaying || this.state.phase !== 'active') return;
        if (this.elapsed() - this.lastStyleCueAt < STYLE_CUE_EVERY_MS) return;
        this.lastStyleCueAt = this.elapsed();
        this.cue(live.styleCue, false);
      }, 5_000),
      setInterval(() => void api.liveProgress(this.conversationId, this.turns()).catch(() => undefined), PROGRESS_EVERY_MS),
    );
  }

  // ───────────── ending ─────────────

  /** Ends the call once: stops audio, then saves the transcript and timing on the server. */
  private async finish(reason: EndReason, error?: string): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.set({ phase: 'ending' });
    const durationMs = this.startedAt === null ? 0 : Date.now() - this.startedAt;
    if (this.userSpeechStartedAt !== null) this.userSpeakingMs += Date.now() - this.userSpeechStartedAt;
    this.userSpeechStartedAt = null;
    this.transcript.finalizeAll();
    this.cleanup();
    try {
      await api.liveComplete(this.conversationId, {
        endReason: reason,
        durationMs,
        turns: this.turns(),
        liveMetrics: { userSpeakingMs: this.userSpeakingMs, responseLatenciesMs: this.responseLatenciesMs.slice(0, 600) },
        usage: this.usage,
      });
    } catch {
      // Network trouble: ask the server to close it (it keeps the transcript saved so far).
      await api.end(this.conversationId).catch(() => undefined);
    }
    if (error && this.startedAt === null) this.set({ phase: 'failed', floor: 'none', error });
    else this.set({ phase: 'ended', floor: 'none', error: error ?? null });
  }

  private fail(message: string): void {
    if (this.finished) return;
    if (this.live) {
      void this.finish(this.startedAt === null ? 'ERROR' : 'CONNECTION_LOST', message);
      return;
    }
    this.finished = true;
    void api.end(this.conversationId).catch(() => undefined);
    this.cleanup();
    this.set({ phase: 'failed', floor: 'none', error: message });
  }

  private cleanup(): void {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    for (const s of this.subs) s.remove();
    this.subs = [];
    void TalkelAudio?.stop().catch(() => undefined);
    this.routeSub?.remove();
    this.routeSub = null;
    this.incall?.stop();
  }

  // ───────────── helpers ─────────────

  private turns() {
    return this.transcript
      .turns()
      .slice(-600)
      .map((t, seq) => ({ ...t, seq, text: t.text.slice(0, 4_000) }));
  }

  private elapsed(): number {
    return this.startedAt === null ? 0 : Date.now() - this.startedAt;
  }

  private cue(text: string, turnComplete: boolean): void {
    if (text) this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete } });
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.setupDone) this.ws.send(JSON.stringify(message));
  }

  private addUsage(u: NonNullable<GeminiMessage['usageMetadata']>): void {
    const byModality = (d: { modality?: string; tokenCount?: number }[] | undefined, m: string) =>
      (d ?? []).filter((x) => x.modality === m).reduce((n, x) => n + (x.tokenCount ?? 0), 0);
    const inAudio = byModality(u.promptTokensDetails, 'AUDIO');
    const outAudio = byModality(u.responseTokensDetails, 'AUDIO');
    this.usage.inputAudioTokens += inAudio;
    this.usage.inputTextTokens += Math.max(0, (u.promptTokenCount ?? 0) - inAudio);
    this.usage.cachedInputTokens += u.cachedContentTokenCount ?? 0;
    this.usage.outputAudioTokens += outAudio;
    this.usage.outputTextTokens += Math.max(0, (u.responseTokenCount ?? 0) - outAudio);
  }

  private updateFloor(): void {
    const floor: Floor = this.aiPlaying ? 'ai' : this.userSpeaking ? 'user' : 'none';
    if (floor !== this.state.floor) this.set({ floor });
  }

  private onAudioDevices(e: { availableAudioDeviceList?: string; selectedAudioDevice?: string }): void {
    let available: string[] = [];
    try {
      available = JSON.parse(e.availableAudioDeviceList ?? '[]') as string[];
    } catch {
      return;
    }
    const routes = ROUTE_ORDER.filter((r) => available.includes(r));
    if (routes.length === 0) return;
    const selected = routes.find((r) => r === e.selectedAudioDevice) ?? this.state.audioRoute;
    this.set({ audioRoutes: routes, audioRoute: selected });
  }

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

async function requestBluetoothPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return;
  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  try {
    if (!(await PermissionsAndroid.check(permission))) await PermissionsAndroid.request(permission);
  } catch {
    // not fatal: the call just won't use a Bluetooth headset
  }
}
