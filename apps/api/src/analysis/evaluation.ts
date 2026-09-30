/**
 * The evaluation AI (PRD §75–76): separate from the conversation AI, optimised for accuracy and
 * structured output. Its answer is validated with Zod — raw LLM JSON is never trusted.
 */
import { type FeedbackLanguage, GrammarCategory } from '@speakai/contracts';
import { z } from 'zod';
import type { FluencyResult } from './metrics.js';

export const EVAL_PROMPT_VERSION = 'eval-v1';

const Band = z.number().int().min(1).max(5);
const Skill = z.object({ band: Band, rationale: z.string().min(1).max(400) });

export const EvaluationOutput = z.object({
  summary: z.string().min(1).max(700),
  strengths: z.array(z.string().max(200)).max(3),
  focusAreas: z.array(z.string().max(200)).max(3),
  skills: z.object({ grammar: Skill, vocabulary: Skill, fluency: Skill, conversation: Skill, clarity: Skill }),
  grammarErrors: z
    .array(
      z.object({
        turnSeq: z.number().int().min(0),
        original: z.string().min(1).max(300),
        corrected: z.string().min(1).max(300),
        category: GrammarCategory,
        explanation: z.string().min(1).max(400),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      }),
    )
    .max(12),
  vocabulary: z
    .array(
      z.object({
        kind: z.enum(['REPEATED', 'UPGRADE', 'GOOD_USAGE']),
        term: z.string().min(1).max(80),
        alternatives: z.array(z.string().max(60)).max(4),
        example: z.string().max(200).nullable(),
      }),
    )
    .max(6),
  conversationSkills: z.object({
    askedQuestions: z.boolean(),
    elaborated: z.boolean(),
    disagreedPolitely: z.boolean().nullable(),
    clarified: z.boolean().nullable(),
    notes: z.string().max(400),
  }),
  translationPatterns: z.array(z.string().max(250)).max(3),
  goalsAchieved: z.array(z.string()).max(10),
  recommendations: z
    .array(
      z.object({
        type: z.enum(['SCENARIO', 'GRAMMAR_FOCUS', 'VOCABULARY', 'FLUENCY']),
        scenarioSlug: z.string().nullable(),
        title: z.string().max(80),
        reason: z.string().max(250),
      }),
    )
    .max(3),
});
export type EvaluationOutput = z.infer<typeof EvaluationOutput>;

/** JSON Schema for Gemini's structured output (generated from the Zod schema, so they can't drift). */
export const evaluationJsonSchema = z.toJSONSchema(EvaluationOutput, { target: 'draft-7', io: 'output' });

export interface EvaluationInput {
  scenario: { title: string; kind: string; userRole: string; objective: string; briefing: string; slug: string };
  goals: Array<{ id: string; description: string }>;
  level: string;
  feedbackLanguage: FeedbackLanguage;
  turns: Array<{ seq: number; speaker: 'USER' | 'AI'; text: string }>;
  fluency: FluencyResult;
  availableScenarios: Array<{ slug: string; title: string }>;
}

const LANGUAGE_NAME: Record<FeedbackLanguage, string> = { en: 'English', hi: 'Hindi (in Devanagari script, simple everyday Hindi)' };

export function buildEvaluationPrompt(input: EvaluationInput): { system: string; user: string } {
  const system = `
You are an expert, encouraging English speaking coach for Indian learners. You analyse the transcript of a spoken
practice conversation between a LEARNER and an AI role-play partner, and return structured feedback.

Rules:
- Judge only the LEARNER's lines. The AI's lines are context.
- The transcript was produced by speech recognition. Ignore punctuation and capitalisation, and do not treat likely
  recognition slips (a single wrong-sounding word) as grammar errors unless you are confident.
- Grammar errors: quote the learner's EXACT words in "original" (copy them from the transcript, only the part that
  needs fixing plus a little context) and give "corrected" in natural English. Use the learner line number in "turnSeq".
  Report only real, important mistakes — at most 12 — most important first. Accept correct Indian English usage.
- Vocabulary: point out words the learner overused (REPEATED), basic words that have better alternatives (UPGRADE,
  max 3 alternatives, suited to the learner's level), and good word choices (GOOD_USAGE). Do not overwhelm: max 6 items.
- Fluency facts (speech rate, fillers, pauses) are MEASURED and given to you. Use them; do not invent numbers.
  Pauses are normal while thinking — only mention them if they clearly broke the conversation.
- Never judge accent or pronunciation (you only have text).
- Bands (1–5), relative to what an effective everyday English speaker would do in this situation:
  1 = hard to follow, 2 = frequent problems, 3 = understandable with noticeable issues, 4 = good with minor issues,
  5 = excellent. Each rationale must cite concrete evidence from the transcript. "clarity" = how easy the learner's
  message was to follow.
- conversationSkills: did they ask questions, elaborate, disagree politely (null if no occasion), clarify (null if no occasion).
- translationPatterns: up to 3 patterns that suggest word-for-word translation from another language, phrased as a
  pattern with a tip. Never claim to know what language they were thinking in.
- goalsAchieved: ids from the goal list that the learner clearly achieved.
- recommendations: up to 3 next steps; for type SCENARIO use one of the available scenario slugs.
- Write summary, strengths, focusAreas, rationales, explanations, notes, translationPatterns and recommendation
  titles/reasons in ${LANGUAGE_NAME[input.feedbackLanguage]}. Keep "original", "corrected", vocabulary terms,
  alternatives and examples in English.
- Be warm, specific and honest. Short sentences. If the learner said very little, say so and keep feedback brief.
`.trim();

  const lines = input.turns
    .filter((t) => t.text.trim())
    .map((t) => `[${t.seq}] ${t.speaker === 'USER' ? 'LEARNER' : 'AI'}: ${t.text}`)
    .join('\n');
  const f = input.fluency;

  const user = `
SCENARIO: ${input.scenario.title} (${input.scenario.kind})
Brief shown to the learner: ${input.scenario.briefing}
Learner's role: ${input.scenario.userRole}
Learner's objective: ${input.scenario.objective}
Learner's self-assessed level: ${input.level}

GOALS (id: description):
${input.goals.map((g) => `- ${g.id}: ${g.description}`).join('\n') || '- (none)'}

MEASURED FLUENCY FACTS:
- Learner speaking time: ${Math.round(f.userSpeakingMs / 1000)} s over ${f.userTurns} turns, ${f.userWords} words
- Speech rate: ${f.wordsPerMinute ?? 'not enough speech to measure'} words per minute
- Average words per turn: ${f.meanUtteranceWords}; vocabulary variety (type/token ratio): ${f.typeTokenRatio}
- Filler words found in the transcript: ${JSON.stringify(f.fillerCounts)} (speech recognition may drop some fillers)
- Response time after the AI finished: median ${f.latencyP50Ms ?? 'n/a'} ms; pauses over 5 s: ${f.longPauseCount}

AVAILABLE SCENARIOS (slug: title): ${input.availableScenarios.map((s) => `${s.slug}: ${s.title}`).join('; ')}

TRANSCRIPT (numbers are line ids for turnSeq):
${lines}
`.trim();

  return { system, user };
}
