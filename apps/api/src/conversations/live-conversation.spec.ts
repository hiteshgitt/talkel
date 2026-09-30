import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiEvent } from '../gemini/gemini-events.js';
import type { LiveSession } from '../gemini/gemini-live.js';
import type { MediaEndpoint, MediaStats } from '../media/webrtc-endpoint.js';
import { LiveConversation, type LiveConversationDeps } from './live-conversation.js';

class FakeMedia implements MediaEndpoint {
  controls: Array<Record<string, unknown>> = [];
  played = 0;
  cleared = 0;
  closed = false;
  private pcm: Array<(b: Buffer) => void> = [];
  private playback: Array<(s: 'started' | 'stopped') => void> = [];
  private closedH: Array<(r: string) => void> = [];
  onUserPcm(h: (b: Buffer) => void) {
    this.pcm.push(h);
  }
  onControlOpen() {}
  onPlayback(h: (s: 'started' | 'stopped') => void) {
    this.playback.push(h);
  }
  onClosed(h: (r: string) => void) {
    this.closedH.push(h);
  }
  playAiPcm() {
    this.played++;
  }
  clearPlayback() {
    this.cleared++;
  }
  aiTurnEnded() {}
  sendControl(e: Record<string, unknown>) {
    this.controls.push(e);
  }
  stats(): MediaStats {
    return { playbackUnderruns: 0, maxSendLatenessMs: 0, phoneReportedLossPct: null, phoneReportedMaxLossPct: null, phoneReportedJitterMs: null, phoneReportedMaxJitterMs: null, phoneReportedPacketsLost: null };
  }
  async close() {
    this.closed = true;
  }
  // test helpers
  speak(frames = 10) {
    const loud = Buffer.alloc(640);
    for (let i = 0; i < 320; i++) loud.writeInt16LE(i % 2 ? 12000 : -12000, i * 2);
    for (let f = 0; f < frames; f++) for (const h of this.pcm) h(loud);
    for (let f = 0; f < 30; f++) for (const h of this.pcm) h(Buffer.alloc(640));
  }
  setPlaying(p: boolean) {
    for (const h of this.playback) h(p ? 'started' : 'stopped');
  }
  drop() {
    for (const h of this.closedH) h('media failed');
  }
}

class FakeLive implements LiveSession {
  cues: Array<{ text: string; turnComplete: boolean }> = [];
  toolResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];
  audioChunks = 0;
  closed = false;
  private ev: Array<(e: GeminiEvent, raw: unknown) => void> = [];
  sendUserAudio() {
    this.audioChunks++;
  }
  sendCue(text: string, turnComplete: boolean) {
    this.cues.push({ text, turnComplete });
  }
  sendToolResponses(r: Array<{ id: string; name: string; response: Record<string, unknown> }>) {
    this.toolResponses.push(...r);
  }
  onEvent(h: (e: GeminiEvent, raw: unknown) => void) {
    this.ev.push(h);
  }
  onClose() {}
  close() {
    this.closed = true;
  }
  emit(e: GeminiEvent) {
    for (const h of this.ev) h(e, {});
  }
}

const nullLog = { write: () => undefined, close: () => undefined };

function setup(overrides: Partial<LiveConversationDeps> = {}) {
  const media = new FakeMedia();
  const live = new FakeLive();
  let clock = 0;
  const onEnded = vi.fn();
  const onFlush = vi.fn();
  const convo = new LiveConversation({
    id: 'c1',
    media,
    live,
    log: nullLog,
    maxDurationMs: 300_000,
    openingCue: '(Call system: open)',
    wrapUpCue: '(Call system: wrap up)',
    handleTool: (name) =>
      name === 'end_conversation'
        ? { response: { ok: true }, endRequested: 'AI_NATURAL_END' }
        : name === 'mark_goal_achieved'
          ? { response: { ok: true }, goalAchieved: 'asked_back' }
          : { response: { ok: true }, stateChanges: { currentOffer: 1800 } },
    onEnded,
    onFlush,
    now: () => clock,
    ...overrides,
  });
  convo.start();
  // Move the injected clock together with the fake timers, in small steps like real time.
  const advance = async (ms: number) => {
    for (let done = 0; done < ms; ) {
      const step = Math.min(100, ms - done);
      clock += step;
      done += step;
      await vi.advanceTimersByTimeAsync(step);
    }
  };
  return { convo, media, live, onEnded, onFlush, advance, userTurns: (n: number) => {
    for (let i = 0; i < n; i++) {
      media.speak();
      live.emit({ type: 'user.transcript', text: `answer ${i}` });
      live.emit({ type: 'ai.transcript', text: `reply ${i}` });
      live.emit({ type: 'turn_complete' });
    }
  } };
}

describe('LiveConversation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens with the cue once media is ready, and forwards audio', () => {
    const { convo, live, media } = setup();
    convo.markMediaReady();
    convo.markMediaReady();
    expect(live.cues).toEqual([{ text: '(Call system: open)', turnComplete: true }]);
    media.speak(3);
    expect(live.audioChunks).toBeGreaterThan(0);
  });

  it('refuses an AI hang-up in the first 45 s, then allows it after the goodbye finishes playing', async () => {
    const { convo, live, media, onEnded, advance, userTurns } = setup();
    convo.markMediaReady();
    live.emit({ type: 'tool_call', calls: [{ id: 't1', name: 'end_conversation', args: {} }] });
    expect(live.toolResponses[0]?.response).toMatchObject({ ok: false });
    expect(convo.isEnded).toBe(false);

    userTurns(2);
    await advance(50_000);
    media.setPlaying(true); // goodbye audio still playing
    live.emit({ type: 'tool_call', calls: [{ id: 't2', name: 'end_conversation', args: {} }] });
    await advance(600);
    expect(convo.isEnded).toBe(false);
    media.setPlaying(false);
    await advance(1500);
    expect(convo.isEnded).toBe(true);
    expect(onEnded.mock.calls[0]![0]).toMatchObject({ endReason: 'AI_NATURAL_END' });
  });

  it('records goals and scenario state changes from tools', () => {
    const { convo, live } = setup();
    convo.markMediaReady();
    live.emit({ type: 'tool_call', calls: [{ id: 'a', name: 'mark_goal_achieved', args: {} }, { id: 'b', name: 'record_offer', args: {} }] });
    const s = convo.snapshot();
    expect(s.goalsAchieved).toEqual(['asked_back']);
    expect(s.stateChanges).toEqual({ currentOffer: 1800 });
    expect(live.toolResponses.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('waits for the phone to reconnect, then carries on with the same AI session', async () => {
    const { convo, media, live, advance } = setup({ reconnectGraceMs: 20_000 });
    convo.markMediaReady();
    media.drop();
    expect(convo.currentStatus).toBe('RECONNECTING');
    await advance(10_000);

    const fresh = new FakeMedia();
    convo.replaceMedia(fresh);
    expect(convo.currentStatus).toBe('ACTIVE');
    expect(media.closed).toBe(true);
    await advance(30_000);
    expect(convo.isEnded).toBe(false); // grace timer was cancelled
    expect(live.closed).toBe(false);

    // events from the old endpoint are ignored
    media.drop();
    expect(convo.currentStatus).toBe('ACTIVE');
  });

  it('ends with CONNECTION_LOST if the phone does not come back in time', async () => {
    const { convo, media, onEnded, advance } = setup({ reconnectGraceMs: 20_000 });
    convo.markMediaReady();
    media.drop();
    await advance(20_001);
    expect(onEnded.mock.calls[0]![0]).toMatchObject({ status: 'ENDED', endReason: 'CONNECTION_LOST' });
  });

  it('warns, wraps up and hard-stops at the time limit, flushing along the way', async () => {
    const { convo, live, media, onEnded, onFlush, advance } = setup({ maxDurationMs: 180_000 });
    convo.markMediaReady();
    await advance(120_000);
    expect(live.cues.at(-1)).toEqual({ text: '(Call system: wrap up)', turnComplete: false });
    expect(media.controls).toContainEqual({ type: 'time_warning', secondsRemaining: 60 });
    expect(onFlush).toHaveBeenCalled();
    await advance(60_000);
    expect(onEnded.mock.calls[0]![0]).toMatchObject({ endReason: 'TIME_LIMIT' });
    expect(media.controls).toContainEqual({ type: 'call.ended', reason: 'TIME_LIMIT' });
  });

  it('flushes barge-in audio immediately', () => {
    const { convo, live, media } = setup();
    convo.markMediaReady();
    live.emit({ type: 'ai.audio', pcm24k: Buffer.alloc(960) });
    live.emit({ type: 'interrupted' });
    expect(media.cleared).toBe(1);
  });
});
