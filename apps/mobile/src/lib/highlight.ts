/**
 * Locates quoted feedback ("I go to office") inside what the learner said, ignoring case,
 * punctuation and spacing, the same way the server grounds it, so the transcript can underline it.
 */

const isWordChar = (ch: string) => /[a-z0-9']/.test(ch);

/** Normalised text plus, for each normalised character, its index in the original. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!.toLowerCase().replace(/[’‘]/, "'");
    if (isWordChar(ch)) {
      if (pendingSpace && norm.length) {
        norm += ' ';
        map.push(i);
      }
      pendingSpace = false;
      norm += ch;
      map.push(i);
    } else {
      pendingSpace = true;
    }
  }
  return { norm, map };
}

/** [start, end) of `quote` in `text`, or null. */
export function findSpan(text: string, quote: string): [number, number] | null {
  const t = normalizeWithMap(text);
  const q = normalizeWithMap(quote).norm;
  if (!q) return null;
  const at = t.norm.indexOf(q);
  if (at < 0) return null;
  return [t.map[at]!, t.map[at + q.length - 1]! + 1];
}

export interface Mark<K extends string> {
  quote: string;
  kind: K;
}

export interface Segment<K extends string> {
  text: string;
  kind: K | null;
}

/** Splits `text` into plain and marked segments. Earlier marks win where marks overlap. */
export function segment<K extends string>(text: string, marks: readonly Mark<K>[]): Segment<K>[] {
  const spans: { start: number; end: number; kind: K }[] = [];
  for (const m of marks) {
    const span = findSpan(text, m.quote);
    if (!span) continue;
    const [start, end] = span;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end, kind: m.kind });
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Segment<K>[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) out.push({ text: text.slice(pos, s.start), kind: null });
    out.push({ text: text.slice(s.start, s.end), kind: s.kind });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), kind: null });
  return out;
}
