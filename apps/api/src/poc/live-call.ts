import type { PocEndReason, PocTranscriptResponse } from '@speakai/contracts';
import type { RealtimeUsage } from '../realtime/realtime-events.js';

/** What the POC service needs from a live call, whichever provider/transport runs it. */
export interface LiveCall {
  readonly callId: string;
  readonly isEnded: boolean;
  readonly usage: RealtimeUsage;
  start(): void;
  /** Device media is up; the AI may speak first. */
  markMediaReady(): void;
  end(reason: PocEndReason): Promise<void>;
  snapshot(): PocTranscriptResponse;
}

export interface CallEventLog {
  write(entry: { t: number; dir: 'in' | 'out' | 'sys'; event: unknown }): void;
  close(): void;
}

export function emptyUsage(): RealtimeUsage {
  return { inputTextTokens: 0, inputAudioTokens: 0, cachedInputTokens: 0, outputTextTokens: 0, outputAudioTokens: 0 };
}

export function addUsage(total: RealtimeUsage, u: RealtimeUsage): void {
  total.inputTextTokens += u.inputTextTokens;
  total.inputAudioTokens += u.inputAudioTokens;
  total.cachedInputTokens += u.cachedInputTokens;
  total.outputTextTokens += u.outputTextTokens;
  total.outputAudioTokens += u.outputAudioTokens;
}
