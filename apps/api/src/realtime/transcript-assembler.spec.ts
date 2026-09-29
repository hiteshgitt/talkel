import { describe, expect, it } from 'vitest';
import { TranscriptAssembler } from './transcript-assembler.js';

describe('TranscriptAssembler', () => {
  it('orders turns by when they started, even if the user transcript arrives after the AI reply', () => {
    const tx = new TranscriptAssembler();
    tx.aiItemAdded('ai1', 'r1', 10);
    tx.aiTranscriptDone('ai1', 'Hey! How was your weekend?', 900);
    tx.userSpeechStarted('u1', 2000);
    tx.aiItemAdded('ai2', 'r2', 3500); // AI starts replying...
    tx.userTranscript('u1', 'It was good, I go to a trek.', 3700); // ...before user ASR completes
    tx.aiTranscriptDone('ai2', 'Oh nice, where did you go?', 4200);

    expect(tx.turns().map((t) => [t.speaker, t.text])).toEqual([
      ['AI', 'Hey! How was your weekend?'],
      ['USER', 'It was good, I go to a trek.'],
      ['AI', 'Oh nice, where did you go?'],
    ]);
    expect(tx.turns()[1]?.startMs).toBe(2000);
  });

  it('marks an AI turn interrupted when its response is cancelled and keeps the partial text', () => {
    const tx = new TranscriptAssembler();
    tx.aiItemAdded('ai1', 'r1', 0);
    tx.aiTranscriptDelta('ai1', 'So I was thinking we ', 100);
    tx.aiTranscriptDelta('ai1', 'could maybe', 200);
    tx.responseDone('r1', 'cancelled');

    const [turn] = tx.turns();
    expect(turn).toMatchObject({ speaker: 'AI', text: 'So I was thinking we could maybe', interrupted: true, final: true });
  });

  it('marks truncated AI items as interrupted', () => {
    const tx = new TranscriptAssembler();
    tx.aiItemAdded('ai1', 'r1', 0);
    tx.aiTranscriptDone('ai1', 'A long sentence.', 50);
    tx.aiItemTruncated('ai1');
    expect(tx.turns()[0]?.interrupted).toBe(true);
  });

  it('drops empty finalised user turns (VAD false positives) and re-packs seq', () => {
    const tx = new TranscriptAssembler();
    tx.userSpeechStarted('noise', 0);
    tx.userTranscript('noise', '', 10);
    tx.userSpeechStarted('u1', 100);
    tx.userTranscript('u1', 'Hello', 200);

    expect(tx.turns()).toEqual([
      { seq: 0, speaker: 'USER', text: 'Hello', startMs: 100, interrupted: false, final: true },
    ]);
  });

  it('shows pending user turns as not final, and failed transcription as inaudible', () => {
    const tx = new TranscriptAssembler();
    tx.userSpeechStarted('u1', 0);
    tx.userSpeechStarted('u2', 500);
    tx.userTranscriptFailed('u2', 600);

    expect(tx.turns().map((t) => [t.text, t.final])).toEqual([
      ['', false],
      ['[inaudible]', true],
    ]);
  });
});
