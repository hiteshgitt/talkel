import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebandConnection } from '../realtime/sideband.js';
import { CallSession, type CallEventLog } from './call-session.js';

class FakeSideband implements SidebandConnection {
  sent: Array<Record<string, unknown>> = [];
  isOpen = true;
  private msg: Array<(raw: unknown) => void> = [];
  private closeHandlers: Array<(code: number, reason: string) => void> = [];

  send(event: Record<string, unknown>): void {
    this.sent.push(event);
  }
  onMessage(h: (raw: unknown) => void): void {
    this.msg.push(h);
  }
  onClose(h: (code: number, reason: string) => void): void {
    this.closeHandlers.push(h);
  }
  close(): void {
    this.isOpen = false;
  }
  emit(raw: unknown): void {
    for (const h of this.msg) h(raw);
  }
  drop(): void {
    this.isOpen = false;
    for (const h of this.closeHandlers) h(1006, 'abnormal');
  }
}

const nullLog: CallEventLog = { write: () => undefined, close: () => undefined };

function setup(maxDurationMs = 300_000) {
  const sideband = new FakeSideband();
  const hangup = vi.fn(async () => undefined);
  const onEnded = vi.fn();
  let clock = 0;
  const session = new CallSession({
    callId: 'rtc_1',
    sideband,
    hangup,
    log: nullLog,
    maxDurationMs,
    wrapUpInstructions: 'BASE + WRAP UP',
    now: () => clock,
    onEnded,
  });
  session.start();
  return { session, sideband, hangup, onEnded, advanceClock: (ms: number) => (clock += ms) };
}

describe('CallSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the AI to speak first only once media is ready, and only once', () => {
    const { session, sideband } = setup();
    expect(sideband.sent).toEqual([]);
    session.markMediaReady();
    session.markMediaReady();
    expect(sideband.sent).toEqual([{ type: 'response.create' }]);
    expect(session.snapshot().status).toBe('ACTIVE');
  });

  it('sends a wrap-up session.update 60 s before the limit, then hangs up at the limit', async () => {
    const { session, sideband, hangup, onEnded } = setup(120_000);
    session.markMediaReady();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sideband.sent.at(-1)).toEqual({
      type: 'session.update',
      session: { type: 'realtime', instructions: 'BASE + WRAP UP' },
    });
    expect(hangup).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hangup).toHaveBeenCalledWith('rtc_1');
    expect(session.snapshot()).toMatchObject({ status: 'ENDED', endReason: 'TIME_LIMIT' });
    expect(onEnded).toHaveBeenCalledOnce();
    expect(sideband.isOpen).toBe(false);
  });

  it('ends exactly once even if end is triggered repeatedly', async () => {
    const { session, hangup, onEnded, sideband } = setup();
    await Promise.all([session.end('USER_ENDED'), session.end('USER_ENDED')]);
    sideband.drop();
    expect(hangup).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(session.snapshot().endReason).toBe('USER_ENDED');
  });

  it('ends with PROVIDER_CLOSED if the sideband drops', async () => {
    const { session, sideband } = setup();
    sideband.drop();
    await vi.runAllTimersAsync();
    expect(session.snapshot()).toMatchObject({ status: 'ENDED', endReason: 'PROVIDER_CLOSED' });
  });

  it('builds the transcript and accumulates usage from provider events', () => {
    const { session, sideband, advanceClock } = setup();
    sideband.emit({ type: 'response.output_item.added', response_id: 'r1', item: { id: 'a1', type: 'message', role: 'assistant' } });
    sideband.emit({ type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'Hey!' });
    sideband.emit({
      type: 'response.done',
      response: { id: 'r1', status: 'completed', usage: { output_token_details: { audio_tokens: 50 } } },
    });
    advanceClock(1500);
    sideband.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1', audio_start_ms: 1500 });
    sideband.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Hi' });

    expect(session.snapshot().turns.map((t) => [t.speaker, t.text, t.startMs])).toEqual([
      ['AI', 'Hey!', 0],
      ['USER', 'Hi', 1500],
    ]);
    expect(session.usage.outputAudioTokens).toBe(50);
  });

  it('still ends cleanly if the provider hangup call fails', async () => {
    const { session, hangup } = setup();
    hangup.mockRejectedValueOnce(new Error('network'));
    await session.end('USER_ENDED');
    expect(session.snapshot().status).toBe('ENDED');
  });
});
