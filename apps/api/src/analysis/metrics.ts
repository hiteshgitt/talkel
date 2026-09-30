/**
 * Deterministic fluency metrics, computed in code — never by the LLM (docs/AI-ARCHITECTURE.md §6).
 * Inputs are the user's transcript turns and timing measured live during the call.
 */

export interface UserTurn {
  seq: number;
  text: string;
}

export interface FluencyResult {
  userSpeakingMs: number;
  userTurns: number;
  userWords: number;
  wordsPerMinute: number | null;
  meanUtteranceWords: number;
  typeTokenRatio: number;
  fillerCounts: Record<string, number>;
  fillersPerMinute: number | null;
  latencyP50Ms: number | null;
  latencyP90Ms: number | null;
  longPauseCount: number;
}

/** A pause longer than this before answering counts as "long" — reported, never penalised on its own (PRD §32). */
export const LONG_PAUSE_MS = 5000;

/** Multi-word fillers first so "you know" isn't also counted as "you". */
const FILLERS: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: 'you know', pattern: /\byou know\b(?!\s+(?:what|how|why|that|the|a|an|when|where|who|if|about)\b)/gi },
  { key: 'I mean', pattern: /\bi mean\b(?=\s*[,.]|\s*$)/gi },
  { key: 'um', pattern: /\b(?:um+|umm+|erm+)\b/gi },
  { key: 'uh', pattern: /\b(?:uh+|er+|ah+)\b/gi },
  { key: 'actually', pattern: /\bactually\b/gi },
  { key: 'basically', pattern: /\bbasically\b/gi },
  // "like" only as a filler: set off by commas or before a pause — not "I like tea" / "like this".
  { key: 'like', pattern: /(?:^|,\s*)like(?=\s*,)|\blike,\s/gi },
];

const WORD = /[a-z']+/gi;

export function words(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => w !== "'");
}

export function countFillers(texts: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const text of texts) {
    for (const { key, pattern } of FILLERS) {
      const n = text.match(pattern)?.length ?? 0;
      if (n) counts[key] = (counts[key] ?? 0) + n;
    }
  }
  return counts;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function computeFluency(
  turns: readonly UserTurn[],
  live: { userSpeakingMs: number; responseLatenciesMs: readonly number[] } | null,
): FluencyResult {
  const texts = turns.map((t) => t.text).filter((t) => t.trim() && t !== '[inaudible]');
  const allWords = texts.flatMap(words);
  const speakingMs = live?.userSpeakingMs ?? 0;
  const minutes = speakingMs / 60_000;
  const fillerCounts = countFillers(texts);
  const fillerTotal = Object.values(fillerCounts).reduce((a, b) => a + b, 0);
  const latencies = live?.responseLatenciesMs ?? [];

  return {
    userSpeakingMs: speakingMs,
    userTurns: texts.length,
    userWords: allWords.length,
    // Speech time under ~10 s gives meaningless rates; report nothing rather than a wrong number.
    wordsPerMinute: speakingMs >= 10_000 ? Math.round(allWords.length / minutes) : null,
    meanUtteranceWords: texts.length ? Math.round((allWords.length / texts.length) * 10) / 10 : 0,
    typeTokenRatio: allWords.length ? Math.round((new Set(allWords).size / allWords.length) * 100) / 100 : 0,
    fillerCounts,
    fillersPerMinute: speakingMs >= 10_000 ? Math.round((fillerTotal / minutes) * 10) / 10 : null,
    latencyP50Ms: percentile(latencies, 50),
    latencyP90Ms: percentile(latencies, 90),
    longPauseCount: latencies.filter((l) => l > LONG_PAUSE_MS).length,
  };
}
