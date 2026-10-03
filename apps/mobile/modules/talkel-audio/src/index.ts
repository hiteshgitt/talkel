import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

export interface MicChunk {
  /** 40 ms of 16 kHz PCM16 mono, base64. */
  data: string;
  /** RMS level 0..1, for the speaking indicator and turn timing. */
  level: number;
}

interface TalkelAudioNative {
  start(): Promise<void>;
  /** Queues 24 kHz PCM16 mono (base64) for playback. */
  play(base64: string): void;
  /** Drops queued and buffered AI audio (barge-in). */
  clear(): void;
  stop(): Promise<void>;
  addListener(event: 'onMic', listener: (e: MicChunk) => void): EventSubscription;
  addListener(event: 'onPlayback', listener: (e: { state: 'started' | 'stopped' }) => void): EventSubscription;
}

/** Null in builds made before this module existed (the app then says it needs updating). */
export const TalkelAudio = requireOptionalNativeModule<TalkelAudioNative>('TalkelAudio');
