import type { VoiceChoice } from '@speakai/contracts';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, type MediaStream, RTCPeerConnection } from '@livekit/react-native-webrtc';
import { pocApi } from '@/lib/api';

export type CallPhase = 'connecting' | 'active' | 'reconnecting' | 'ending' | 'ended' | 'failed';
/** Who is audibly "holding the floor" right now — drives the listening/speaking indicator. */
export type Floor = 'none' | 'user' | 'ai';

export interface CallState {
  phase: CallPhase;
  floor: Floor;
  callId: string | null;
  muted: boolean;
  speaker: boolean;
  connectedAt: number | null;
  error: string | null;
}

type Listener = (state: CallState) => void;

const DISCONNECT_GRACE_MS = 5_000;

/**
 * One realtime voice call. Media goes device ⇄ provider over WebRTC; the backend only handles
 * signalling and control (docs/VOICE-ARCHITECTURE.md §3). Framework-free so the React layer
 * stays thin.
 */
export class RealtimeCall {
  private state: CallState = {
    phase: 'connecting',
    floor: 'none',
    callId: null,
    muted: false,
    speaker: false,
    connectedAt: null,
    error: null,
  };
  private readonly listeners = new Set<Listener>();
  private pc: RTCPeerConnection | null = null;
  private mic: MediaStream | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readySent = false;
  private closed = false;

  constructor(private readonly voice: VoiceChoice) {}

  getState(): CallState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    try {
      // Phone-call audio mode: earpiece by default, echo-cancelled voice path, proximity handling.
      InCallManager.start({ media: 'audio' });
      InCallManager.setForceSpeakerphoneOn(false);

      // react-native-webrtc enables echo cancellation, noise suppression and AGC by default on
      // Android (its typings don't expose those constraint keys).
      this.mic = await mediaDevices.getUserMedia({ audio: true });
      if (this.closed) {
        for (const t of this.mic.getTracks()) t.stop();
        return;
      }

      const pc = new RTCPeerConnection({});
      this.pc = pc;
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);

      // The provider requires this channel; we only read VAD/audio-buffer events from it for UI.
      const events = pc.createDataChannel('oai-events');
      events.onopen = () => void this.onMediaReady();
      // The library types message events as a bare Event; at runtime they carry `data`.
      events.onmessage = (e) => this.onProviderEvent((e as unknown as { data: unknown }).data);

      pc.onconnectionstatechange = () => this.onConnectionState(pc.connectionState);

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      const sdpOffer = pc.localDescription?.sdp;
      if (!sdpOffer) throw new Error('Could not create a call offer');

      const { callId, sdpAnswer } = await pocApi.connect({ sdpOffer, voice: this.voice });
      if (this.closed) {
        // User hung up while we were connecting: make sure the server-side call doesn't linger.
        void pocApi.end(callId).catch(() => undefined);
        return;
      }
      this.set({ callId });
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
    } catch (err) {
      if (!this.closed) this.fail(err instanceof Error ? err.message : 'Could not start the call');
    }
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !muted;
    this.set({ muted });
  }

  toggleSpeaker(): void {
    const speaker = !this.state.speaker;
    InCallManager.setForceSpeakerphoneOn(speaker);
    this.set({ speaker });
  }

  /** User hangs up. Returns the call id so the UI can show the transcript. */
  async hangUp(): Promise<string | null> {
    const { callId, phase } = this.state;
    if (phase === 'ended' || phase === 'ending') return callId;
    this.set({ phase: 'ending' });
    if (callId) {
      try {
        await pocApi.end(callId);
      } catch {
        // The server also ends calls on its own timers; the transcript is still retrievable.
      }
    }
    this.cleanup();
    this.set({ phase: 'ended', floor: 'none' });
    return callId;
  }

  private async onMediaReady(): Promise<void> {
    const { callId } = this.state;
    if (this.readySent || !callId) return;
    this.readySent = true;
    this.set({ phase: 'active', connectedAt: Date.now() });
    try {
      await pocApi.ready(callId); // server asks the AI to speak first
    } catch (err) {
      this.fail(err instanceof Error ? err.message : 'Could not start the conversation');
    }
  }

  private onProviderEvent(data: unknown): void {
    if (typeof data !== 'string') return;
    let type: unknown;
    try {
      type = (JSON.parse(data) as { type?: unknown }).type;
    } catch {
      return;
    }
    switch (type) {
      case 'input_audio_buffer.speech_started':
        this.set({ floor: 'user' });
        break;
      case 'input_audio_buffer.speech_stopped':
        if (this.state.floor === 'user') this.set({ floor: 'none' });
        break;
      case 'output_audio_buffer.started':
        this.set({ floor: 'ai' });
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        if (this.state.floor === 'ai') this.set({ floor: 'none' });
        break;
    }
  }

  private onConnectionState(s: string): void {
    if (this.state.phase === 'ending' || this.state.phase === 'ended') return;
    if (s === 'connected') {
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      if (this.state.phase === 'reconnecting') this.set({ phase: 'active' });
    } else if (s === 'disconnected') {
      // Brief network blips recover on their own via ICE; only give up after a grace period.
      this.set({ phase: 'reconnecting' });
      this.disconnectTimer ??= setTimeout(() => this.fail('Connection lost'), DISCONNECT_GRACE_MS);
    } else if (s === 'failed') {
      this.fail('Connection lost');
    }
  }

  private fail(message: string): void {
    if (this.state.phase === 'ended' || this.state.phase === 'failed') return;
    const { callId } = this.state;
    if (callId) void pocApi.end(callId).catch(() => undefined); // make sure the server stops billing
    this.cleanup();
    this.set({ phase: 'failed', floor: 'none', error: message });
  }

  private cleanup(): void {
    this.closed = true;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.pc?.close();
    this.pc = null;
    InCallManager.stop();
  }

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
}
