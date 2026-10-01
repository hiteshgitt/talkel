/**
 * Personal memory rules (pure): where memory is used and learned, and how the evaluator's
 * suggestions are applied to the stored list.
 */

/** Only conversations where the user speaks as themselves — never missions or role-plays. */
export const MEMORY_KINDS_OF_SCENARIO = ['casual', 'interview'] as const;

export function memoryApplies(s: { kind: string; missionLevel: number | null; isReplay: boolean }): boolean {
  return s.missionLevel === null && !s.isReplay && (MEMORY_KINDS_OF_SCENARIO as readonly string[]).includes(s.kind);
}

/** Memories shown to the AI per conversation, and kept per user. */
export const MEMORIES_IN_PROMPT = 10;
export const MAX_MEMORIES = 30;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface StoredMemory {
  id: string;
  kind: string;
  text: string;
}
export interface MemorySuggestion {
  ref: string | null;
  kind: string;
  text: string;
}
export type MemoryChange = { update: { id: string; kind: string; text: string } } | { create: { kind: string; text: string } };

/**
 * Turns the evaluator's suggestions into changes: `ref` (m1, m2…) updates an existing item; otherwise
 * a new item is added unless it duplicates one or the list is full.
 */
export function planMemoryChanges(existing: readonly StoredMemory[], suggestions: readonly MemorySuggestion[]): MemoryChange[] {
  const changes: MemoryChange[] = [];
  const known = new Set(existing.map((m) => norm(m.text)));
  let count = existing.length;
  for (const s of suggestions) {
    const text = s.text.trim();
    if (!text || known.has(norm(text))) continue;
    const target = s.ref ? existing[Number(s.ref.replace(/^m/, '')) - 1] : undefined;
    if (target) {
      changes.push({ update: { id: target.id, kind: s.kind, text } });
    } else if (count < MAX_MEMORIES) {
      changes.push({ create: { kind: s.kind, text } });
      count++;
    }
    known.add(norm(text));
  }
  return changes;
}
