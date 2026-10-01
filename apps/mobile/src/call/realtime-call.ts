import type { MediaStream, RTCPeerConnection } from '@livekit/react-native-webrtc';
import { DeviceEventEmitter, type EmitterSubscription, PermissionsAndroid, Platform } from 'react-native';
import type InCallManagerType from 'react-native-incall-manager';
import { api, friendlyError } from '@/lib/api';
import { nativeCallingProblem } from '@/lib/runtime';

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
  /** Seconds left when the server's one-minute warning arrives. */
  warningSecondsLeft: number | null;
  /** Server-confirmed: this call is being recorded. */
  recording: boolean;
  /** Last recording error (e.g. privacy notice not accepted), cleared on the next attempt. */
  recordingError: string | null;
  error: string | null;
}

type Listener = (state: CallState) => void;
type WebRtc = typeof import('@livekit/react-native-webrtc');

/** Wait this long for ICE to recover on its own before rebuilding the connection. */
const ICE_GRACE_MS = 4_000;
/** The server keeps the AI session alive for 20 s; give up a little before that. */
const RECONNECT_WINDOW_MS = 18_000;

/**
 * One voice conversation. The phone talks WebRTC to our voice gateway, which bridges to the AI.
 * If the network drops, a fresh peer connection rejoins the same conversation (the AI keeps
 * its context on the server). Framework-free so the React layer stays thin.
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
    recording: false,
    recordingError: null,
    error: null,
  };
  private readonly listeners = new Set<Listener>();
  private webrtc: WebRtc | null = null;
  private pc: RTCPeerConnection | null = null;
  private mic: MediaStream | null = null;
  private incall: typeof InCallManagerType | null = null;
  private routeSub: EmitterSubscription | null = null;
  private iceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline: number | null = null;
  private readySent = false;
  private closed = false;
  private hold: AbortController | null = null;

  constructor(readonly conversationId: string) {}

  getState(): CallState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const problem = nativeCallingProblem();
    if (problem) {
      this.fail(problem);
      return;
    }
    try {
      // Loaded lazily: the native modules only exist in our own builds, and Expo Router evaluates
      // every route at startup, so a top-level import would crash the app elsewhere.
      this.webrtc = await import('@livekit/react-native-webrtc');
      this.incall = (await import('react-native-incall-manager')).default;

      // Android 12+ only routes to a Bluetooth headset with the "Nearby devices" permission, and it
      // must be granted before the audio manager starts. Refusing is fine: earpiece/speaker still work.
      await requestBluetoothPermission();
      this.routeSub = DeviceEventEmitter.addListener('onAudioDeviceChanged', (e: { availableAudioDeviceList?: string; selectedAudioDevice?: string }) =>
        this.onAudioDevices(e),
      );

      // Phone-call audio mode: a connected headset first, else the earpiece; echo-cancelled voice
      // path, proximity handling.
      this.incall.start({ media: 'audio' });
      this.incall.setForceSpeakerphoneOn(false);

      // WebRTC applies echo cancellation, noise suppression and AGC by default on Android.
      this.mic = await this.webrtc.mediaDevices.getUserMedia({ audio: true });
      if (this.closed) {
        for (const t of this.mic.getTracks()) t.stop();
        return;
      }
      await this.connect(false);
    } catch (err) {
      if (!this.closed) this.fail(friendlyError(err));
    }
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = !muted;
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

  async toggleRecording(): Promise<void> {
    if (this.state.phase !== 'active') return;
    const next = !this.state.recording;
    this.set({ recordingError: null });
    try {
      const { recording } = await api.setRecording(this.conversationId, next);
      this.set({ recording });
    } catch (err) {
      this.set({ recordingError: friendlyError(err) });
    }
  }

  /** User hangs up (or the server ended the call). */
  async hangUp(): Promise<void> {
    const { phase } = this.state;
    if (phase === 'ended' || phase === 'ending') return;
    this.set({ phase: 'ending' });
    try {
      await api.end(this.conversationId);
    } catch {
      // The server also ends calls on its own; the conversation is saved either way.
    }
    this.cleanup();
    this.set({ phase: 'ended', floor: 'none' });
  }

  // ───────────── connection ─────────────

  private async connect(reconnect: boolean): Promise<void> {
    const webrtc = this.webrtc;
    const mic = this.mic;
    if (!webrtc || !mic) return;

    // STUN finds the phone's public address; in production TURN relays the audio (the server's
    // hosting can't receive UDP). Fetched per connection because TURN credentials expire.
    const iceServers = await api
      .iceServers()
      .then((r) => r.iceServers)
      .catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]);
    if (this.closed) return;
    const pc = new webrtc.RTCPeerConnection({ iceServers });
    this.pc = pc;
    for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);

    // Control channel from our gateway: speaking indicator, time warning, server-side end.
    const events = pc.createDataChannel('events');
    events.onopen = () => void this.onMediaUp();
    // The library types message events as a bare Event; at runtime they carry `data`.
    events.onmessage = (e) => this.onControl((e as unknown as { data: unknown }).data);
    pc.onconnectionstatechange = () => {
      if (pc === this.pc) this.onConnectionState(pc.connectionState);
    };

    await pc.setLocalDescription(await pc.createOffer({ offerToReceiveAudio: true }));
    const sdpOffer = pc.localDescription?.sdp;
    if (!sdpOffer) throw new Error('Could not create a call offer');

    const { sdpAnswer } = await api.connect(this.conversationId, { sdpOffer, reconnect });
    if (this.closed || pc !== this.pc) {
      pc.close();
      return;
    }
    this.holdOpen();
    await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
  }

  private async onMediaUp(): Promise<void> {
    if (this.state.phase === 'reconnecting') {
      this.reconnectDeadline = null;
      this.set({ phase: 'active', error: null });
      return;
    }
    if (this.readySent) return;
    this.readySent = true;
    this.set({ phase: 'active', connectedAt: Date.now() });
    try {
      await api.ready(this.conversationId); // the AI opens the conversation
    } catch (err) {
      this.fail(friendlyError(err));
    }
  }

  private onConnectionState(s: string): void {
    if (this.closed) return;
    if (s === 'connected') {
      if (this.iceTimer) clearTimeout(this.iceTimer);
      this.iceTimer = null;
      if (this.state.phase === 'reconnecting' && this.reconnectDeadline === null) this.set({ phase: 'active' });
      return;
    }
    if (!this.readySent) {
      if (s === 'failed') this.fail('Could not connect the call');
      return;
    }
    if (s === 'disconnected') {
      // Short blips usually recover on their own; rebuild only if they don't.
      this.set({ phase: 'reconnecting' });
      this.iceTimer ??= setTimeout(() => void this.rejoin(), ICE_GRACE_MS);
    } else if (s === 'failed') {
      void this.rejoin();
    }
  }

  /** Builds a new peer connection and rejoins the same conversation on the server. */
  private async rejoin(): Promise<void> {
    if (this.closed) return;
    if (this.iceTimer) clearTimeout(this.iceTimer);
    this.iceTimer = null;
    this.reconnectDeadline ??= Date.now() + RECONNECT_WINDOW_MS;
    this.set({ phase: 'reconnecting' });

    while (!this.closed && Date.now() < this.reconnectDeadline) {
      this.pc?.close();
      this.pc = null;
      try {
        await this.connect(true);
        return; // onMediaUp flips us back to "active"
      } catch (err) {
        const msg = friendlyError(err);
        if (msg.includes('already ended')) break;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    if (!this.closed && this.state.phase === 'reconnecting') {
      this.fail('Connection lost');
    }
  }

  private onControl(data: unknown): void {
    if (typeof data !== 'string') return;
    let event: { type?: unknown; floor?: unknown; secondsRemaining?: unknown };
    try {
      event = JSON.parse(data) as typeof event;
    } catch {
      return;
    }
    switch (event.type) {
      case 'floor':
        if (event.floor === 'user' || event.floor === 'ai' || event.floor === 'none') this.set({ floor: event.floor });
        break;
      case 'time_warning':
        if (typeof event.secondsRemaining === 'number') this.set({ warningSecondsLeft: event.secondsRemaining });
        break;
      case 'recording':
        this.set({ recording: (event as { on?: unknown }).on === true });
        break;
      case 'call.ended':
        void this.hangUp();
        break;
    }
  }

  private fail(message: string): void {
    if (this.state.phase === 'ended' || this.state.phase === 'failed') return;
    void api.end(this.conversationId).catch(() => undefined); // make sure the server stops the AI
    this.cleanup();
    this.set({ phase: 'failed', floor: 'none', error: message });
  }

  /**
   * Keeps one request open for the whole call: the server's hosting (Cloud Run, request-based) only
   * gets CPU while a request is in flight. Re-opened if it drops while the call is still going.
   */
  private holdOpen(): void {
    if (this.hold || this.closed) return;
    const ctrl = new AbortController();
    this.hold = ctrl;
    const reopen = () => {
      if (this.hold !== ctrl) return;
      this.hold = null;
      if (!this.closed) setTimeout(() => this.holdOpen(), 1_000);
    };
    api.holdCall(this.conversationId, ctrl.signal).then(reopen, reopen);
  }

  private cleanup(): void {
    this.closed = true;
    const hold = this.hold;
    this.hold = null;
    hold?.abort();
    if (this.iceTimer) clearTimeout(this.iceTimer);
    this.iceTimer = null;
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.pc?.close();
    this.pc = null;
    this.routeSub?.remove();
    this.routeSub = null;
    this.incall?.stop();
  }

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
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
