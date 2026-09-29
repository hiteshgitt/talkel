import type { TranscriptTurn } from '@speakai/contracts';

/**
 * Builds an ordered transcript from out-of-order realtime events.
 *
 * Ordering problem: a user turn's transcription arrives asynchronously, often *after*
 * the AI has already started replying. We therefore fix each turn's position when the
 * turn *begins* (user: speech_started; AI: output item added) and fill in text later.
 */
interface MutableTurn {
  seq: number;
  itemId: string;
  speaker: TranscriptTurn['speaker'];
  responseId: string | null;
  startMs: number;
  text: string;
  deltas: string;
  interrupted: boolean;
  final: boolean;
}

export class TranscriptAssembler {
  private readonly byItem = new Map<string, MutableTurn>();
  private readonly ordered: MutableTurn[] = [];

  userSpeechStarted(itemId: string, atMs: number): void {
    this.ensure(itemId, 'USER', null, atMs);
  }

  userTranscript(itemId: string, text: string, atMs: number): void {
    const turn = this.ensure(itemId, 'USER', null, atMs);
    turn.text = text;
    turn.final = true;
  }

  userTranscriptFailed(itemId: string, atMs: number): void {
    const turn = this.ensure(itemId, 'USER', null, atMs);
    turn.text = '[inaudible]';
    turn.final = true;
  }

  aiItemAdded(itemId: string, responseId: string, atMs: number): void {
    this.ensure(itemId, 'AI', responseId, atMs);
  }

  aiTranscriptDelta(itemId: string, delta: string, atMs: number): void {
    this.ensure(itemId, 'AI', null, atMs).deltas += delta;
  }

  aiTranscriptDone(itemId: string, text: string, atMs: number): void {
    const turn = this.ensure(itemId, 'AI', null, atMs);
    turn.text = text;
    turn.final = true;
  }

  /** The provider truncated an AI item to what the user actually heard (barge-in). */
  aiItemTruncated(itemId: string): void {
    const turn = this.byItem.get(itemId);
    if (turn) turn.interrupted = true;
  }

  /** A cancelled response means the user interrupted it; finalise its items with what we have. */
  responseDone(responseId: string, status: string): void {
    for (const turn of this.ordered) {
      if (turn.responseId !== responseId) continue;
      if (status === 'cancelled') turn.interrupted = true;
      if (!turn.final) {
        turn.text = turn.deltas.trim();
        turn.final = true;
      }
    }
  }

  /**
   * Snapshot for the API. Empty finalised user turns (VAD false positives such as a cough)
   * are dropped; sequence numbers are re-packed so clients get a dense 0..n-1 list.
   */
  turns(): TranscriptTurn[] {
    return this.ordered
      .filter((t) => !(t.final && t.text === ''))
      .map((t, i) => ({
        seq: i,
        speaker: t.speaker,
        text: t.final ? t.text : t.deltas.trim(),
        startMs: t.startMs,
        interrupted: t.interrupted,
        final: t.final,
      }));
  }

  private ensure(
    itemId: string,
    speaker: TranscriptTurn['speaker'],
    responseId: string | null,
    atMs: number,
  ): MutableTurn {
    let turn = this.byItem.get(itemId);
    if (!turn) {
      turn = {
        seq: this.ordered.length,
        itemId,
        speaker,
        responseId,
        startMs: Math.max(0, Math.round(atMs)),
        text: '',
        deltas: '',
        interrupted: false,
        final: false,
      };
      this.byItem.set(itemId, turn);
      this.ordered.push(turn);
    } else if (responseId && !turn.responseId) {
      turn.responseId = responseId;
    }
    return turn;
  }
}
