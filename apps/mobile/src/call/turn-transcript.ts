// Shared logic with the API (apps/api/src/gemini/turn-transcript.ts): keep the two in step.
import type { TranscriptTurn } from '@speakai/contracts';

interface Turn {
  speaker: TranscriptTurn['speaker'];
  text: string;
  startMs: number;
  interrupted: boolean;
  final: boolean;
}

/**
 * Transcript builder for turn-based providers (Gemini Live), which stream transcription text
 * without item ids. User turns are anchored at speech onset (detected on our side) so their
 * position stays correct even when the transcription text arrives after the AI starts replying.
 */
export class TurnTranscript {
  private readonly list: Turn[] = [];

  /** Local speech onset. Opens a new user turn unless one is already open and still empty/current. */
  userSpeechStarted(atMs: number): void {
    const last = this.last();
    if (last?.speaker === 'USER' && !last.final) return;
    this.push('USER', atMs);
  }

  userText(delta: string, atMs: number): void {
    const last = this.last();
    // A completed AI turn means this is new user speech; otherwise it is (possibly late)
    // transcription for the most recent user turn.
    let target = last && !(last.speaker === 'AI' && last.final) ? this.lastOf('USER') : undefined;
    target ??= this.push('USER', atMs);
    target.text += delta;
  }

  aiOutput(atMs: number): void {
    this.currentAi(atMs);
  }

  aiText(delta: string, atMs: number): void {
    this.currentAi(atMs).text += delta;
  }

  /** Target the latest AI turn, not the latest turn: barge-in speech has usually opened a user turn already. */
  interrupted(): void {
    const ai = this.lastOf('AI');
    if (ai && !ai.final) {
      ai.interrupted = true;
      ai.final = true;
    }
  }

  turnComplete(): void {
    const ai = this.lastOf('AI');
    if (!ai || ai.final) return;
    ai.final = true;
    const aiIndex = this.list.indexOf(ai);
    for (const t of this.list.slice(0, aiIndex)) if (t.speaker === 'USER') t.final = true;
  }

  finalizeAll(): void {
    for (const t of this.list) t.final = true;
  }

  turns(): TranscriptTurn[] {
    return this.list
      .map((t) => ({ ...t, text: t.text.replace(/\s+/g, ' ').trim() }))
      .filter((t) => !(t.final && t.text === ''))
      .map((t, seq) => ({ seq, speaker: t.speaker, text: t.text, startMs: t.startMs, interrupted: t.interrupted, final: t.final }));
  }

  private currentAi(atMs: number): Turn {
    const last = this.last();
    if (last?.speaker === 'AI' && !last.final) return last;
    // AI transcription lags its audio. If the user just started talking over the AI (an empty user
    // turn opened after it), the text still belongs to the AI turn that is being spoken.
    const ai = this.lastOf('AI');
    if (ai && !ai.final) {
      const after = this.list.slice(this.list.indexOf(ai) + 1);
      if (after.every((t) => t.speaker === 'USER' && t.text === '')) return ai;
    }
    return this.push('AI', atMs);
  }

  private push(speaker: Turn['speaker'], atMs: number): Turn {
    const turn: Turn = { speaker, text: '', startMs: Math.max(0, Math.round(atMs)), interrupted: false, final: false };
    this.list.push(turn);
    return turn;
  }

  private last(): Turn | undefined {
    return this.list.at(-1);
  }

  private lastOf(speaker: Turn['speaker']): Turn | undefined {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i]!.speaker === speaker) return this.list[i];
    return undefined;
  }
}
