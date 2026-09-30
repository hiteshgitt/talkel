import type { RealtimeUsage } from './realtime-events.js';

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
