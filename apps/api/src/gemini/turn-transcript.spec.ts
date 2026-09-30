import { describe, expect, it } from 'vitest';
import { TurnTranscript } from './turn-transcript.js';

const view = (tx: TurnTranscript) => tx.turns().map((t) => [t.speaker, t.text, t.interrupted]);

describe('TurnTranscript', () => {
  it('builds alternating turns from streamed deltas', () => {
    const tx = new TurnTranscript();
    tx.aiOutput(0);
    tx.aiText('Hey! How', 10);
    tx.aiText(' was your weekend?', 20);
    tx.turnComplete();
    tx.userSpeechStarted(2000);
    tx.userText('It was', 2600);
    tx.userText(' good.', 2700);
    tx.aiText('Nice!', 3500);
    tx.turnComplete();

    expect(view(tx)).toEqual([
      ['AI', 'Hey! How was your weekend?', false],
      ['USER', 'It was good.', false],
      ['AI', 'Nice!', false],
    ]);
    expect(tx.turns()[1]?.startMs).toBe(2000);
  });

  it('keeps late user transcription in the right place (after the AI already started replying)', () => {
    const tx = new TurnTranscript();
    tx.userSpeechStarted(1000);
    tx.aiOutput(2500); // AI starts before the user's text arrives
    tx.userText('I go to trek', 2600);
    tx.aiText('Where did you go?', 2700);
    tx.turnComplete();

    expect(view(tx)).toEqual([
      ['USER', 'I go to trek', false],
      ['AI', 'Where did you go?', false],
    ]);
  });

  it('records barge-in: AI turn marked interrupted, user speech becomes a new turn after it', () => {
    const tx = new TurnTranscript();
    tx.aiText('So I was thinking we could', 0);
    tx.userSpeechStarted(1200);
    tx.interrupted();
    tx.userText('Wait, one question', 1500);

    expect(view(tx)).toEqual([
      ['AI', 'So I was thinking we could', true],
      ['USER', 'Wait, one question', false],
    ]);
  });

  it('keeps lagging AI text in the AI turn when the user barges in', () => {
    const tx = new TurnTranscript();
    tx.aiText('But don’t you think collaboration is easier when you’re sitting', 0);
    tx.userSpeechStarted(1500); // user talks over the AI…
    tx.aiText(' next to your team?', 1600); // …while the AI's transcript is still catching up
    tx.interrupted();
    tx.userText('Wait, one question', 2000);
    expect(view(tx)).toEqual([
      ['AI', 'But don’t you think collaboration is easier when you’re sitting next to your team?', true],
      ['USER', 'Wait, one question', false],
    ]);
  });

  it('drops empty finalised turns (noise onsets) and marks everything final at the end', () => {
    const tx = new TurnTranscript();
    tx.userSpeechStarted(0); // cough
    tx.aiText('Hello?', 500);
    tx.turnComplete();
    tx.userSpeechStarted(900);
    tx.userText('Hi', 1000);
    tx.finalizeAll();

    expect(tx.turns()).toEqual([
      { seq: 0, speaker: 'AI', text: 'Hello?', startMs: 500, interrupted: false, final: true },
      { seq: 1, speaker: 'USER', text: 'Hi', startMs: 900, interrupted: false, final: true },
    ]);
  });
});
