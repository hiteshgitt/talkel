/**
 * The evaluation AI (PRD §75–76): separate from the conversation AI, optimised for accuracy and
 * structured output. Its answer is validated with Zod — raw LLM JSON is never trusted.
 */
import { type FeedbackLanguage, GrammarCategory, MissionSkill, MomentKind } from '@speakai/contracts';
import { z } from 'zod';
import type { FluencyResult } from './metrics.js';

export const EVAL_PROMPT_VERSION = 'eval-v3';

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
    .max(20),
  phrasing: z
    .array(
      z.object({
        turnSeq: z.number().int().min(0),
        original: z.string().min(1).max(300),
        better: z.string().min(1).max(300),
        why: z.string().min(1).max(300),
      }),
    )
    .max(8),
  vocabulary: z
    .array(
      z.object({
        kind: z.enum(['REPEATED', 'UPGRADE', 'GOOD_USAGE']),
        term: z.string().min(1).max(80),
        alternatives: z.array(z.string().max(60)).max(4),
        example: z.string().max(200).nullable(),
      }),
    )
    .max(8),
  conversationSkills: z.object({
    askedQuestions: z.boolean(),
    elaborated: z.boolean(),
    disagreedPolitely: z.boolean().nullable(),
    clarified: z.boolean().nullable(),
    notes: z.string().max(400),
  }),
  conversationMoments: z
    .array(
      z.object({
        turnSeq: z.number().int().min(0),
        kind: MomentKind,
        youSaid: z.string().min(1).max(300),
        better: z.string().min(1).max(400),
        why: z.string().min(1).max(300),
      }),
    )
    .max(5),
  translationPatterns: z.array(z.string().max(250)).max(3),
  goalsAchieved: z.array(z.string()).max(10),
  /** Missions only (null otherwise): did the user achieve the mission, and mission-specific skills. */
  mission: z
    .object({
      result: z.enum(['SUCCESS', 'PARTIAL', 'FAILED']),
      headline: z.string().min(1).max(120),
      reason: z.string().min(1).max(500),
      skills: z.array(z.object({ key: MissionSkill, band: Band, rationale: z.string().min(1).max(300) })).max(4),
    })
    .nullable(),
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

/** The full JSON Schema, generated from the Zod schema so they can't drift. */
const strictJsonSchema = z.toJSONSchema(EvaluationOutput, { target: 'draft-7', io: 'output' }) as JsonSchemaNode;

/** Size limits that make Gemini's constrained decoding reject large schemas ("invalid argument"). */
const SIZE_KEYWORDS = new Set(['maxItems', 'minItems', 'maxLength', 'minLength', 'maximum', 'minimum']);

function withoutSizeLimits(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutSizeLimits);
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).filter(([k]) => !SIZE_KEYWORDS.has(k)).map(([k, v]) => [k, withoutSizeLimits(v)]));
  }
  return node;
}

/**
 * Schema for Gemini's structured output: same shape, types and enums, but no size limits.
 * Limits are applied afterwards by clampEvaluation(), then Zod validates strictly.
 */
export const evaluationJsonSchema = withoutSizeLimits(strictJsonSchema);

interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  maxItems?: number;
  maxLength?: number;
}

function clampNode(value: unknown, schema: JsonSchemaNode | undefined): unknown {
  if (!schema) return value;
  if (typeof value === 'string' && schema.maxLength !== undefined && value.length > schema.maxLength) {
    return `${value.slice(0, schema.maxLength - 1).trimEnd()}…`;
  }
  if (Array.isArray(value)) {
    const kept = schema.maxItems !== undefined ? value.slice(0, schema.maxItems) : value;
    return kept.map((v) => clampNode(v, schema.items));
  }
  if (value && typeof value === 'object' && schema.properties) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clampNode(v, schema.properties![k])]));
  }
  return value;
}

/** Trims over-long lists and texts to the schema's limits (the model is asked to respect them, but may not). */
export function clampEvaluation(raw: unknown): unknown {
  return clampNode(raw, strictJsonSchema);
}

export interface EvaluationInput {
  scenario: { title: string; kind: string; userRole: string; objective: string; briefing: string; slug: string };
  goals: Array<{ id: string; description: string }>;
  level: string;
  feedbackLanguage: FeedbackLanguage;
  turns: Array<{ seq: number; speaker: 'USER' | 'AI'; text: string }>;
  fluency: FluencyResult;
  availableScenarios: Array<{ slug: string; title: string }>;
  /** Missions only. `outcome` is the rendered success rule (it may mention the AI's secrets). */
  mission?: { level: number; levelName: string; aiCharacter: string; skills: readonly string[]; outcome: string } | null;
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
- The learner wants to improve, so be thorough: find every real mistake, not only the big ones.
- Always quote the learner's EXACT words (copied from the transcript: only the part that needs fixing plus a little
  context) and use the learner line number as "turnSeq". Never quote the AI.
- grammarErrors: EVERY real grammar or wrong-word mistake, up to 20, most important first. severity HIGH = changes the
  meaning or sounds clearly wrong; MEDIUM = noticeable; LOW = small slip. If the same mistake repeats, give at most two
  examples of it. Accept correct Indian English usage. "corrected" is natural English.
- phrasing: up to 8 sentences that are grammatically acceptable but unnatural, too literal (word-for-word), or too
  formal/informal for the situation. "better" is how a fluent speaker would say it; "why" is one short reason. Do not
  repeat anything already listed in grammarErrors.
- vocabulary: words the learner overused (REPEATED), basic words with better alternatives (UPGRADE, max 3 alternatives
  suited to the learner's level) and good word choices (GOOD_USAGE). Max 8 items.
- conversationMoments: up to 5 specific learner replies that worked against the conversation or the objective:
  TOO_SHORT (a very short answer where more was expected), MISSED_QUESTION (did not answer what was asked),
  NO_FOLLOW_UP (missed a natural chance to ask back or keep the conversation going), OFF_TOPIC, ABRUPT_TONE (could
  sound rude or too direct), UNCLEAR (hard to follow). "youSaid" quotes the learner; "better" is an example reply in
  English at the learner's level; "why" explains briefly. Only real moments — none is fine for a good conversation.
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
- mission: null unless the input has a MISSION section. If it does: judge the result strictly by the outcome rule
  (SUCCESS / PARTIAL / FAILED), write a short factual headline (≤ 10 words, state numbers when the rule asks for them),
  a reason of 1–2 sentences, and a band (1–5) with evidence for each listed mission skill.
- Write summary, strengths, focusAreas, rationales, explanations, "why", notes, translationPatterns and recommendation
  titles/reasons, mission headline and reason in ${LANGUAGE_NAME[input.feedbackLanguage]}. Keep "original", "corrected", "better", "youSaid",
  vocabulary terms, alternatives and examples in English.
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

${
  input.mission
    ? `MISSION (level ${input.mission.level} of 5, "${input.mission.levelName}"):
- The AI played: ${input.mission.aiCharacter}
- Outcome rule: ${input.mission.outcome}
- Mission skills to score: ${input.mission.skills.join(', ')}

`
    : ''
}AVAILABLE SCENARIOS (slug: title): ${input.availableScenarios.map((s) => `${s.slug}: ${s.title}`).join('; ')}

TRANSCRIPT (numbers are line ids for turnSeq):
${lines}
`.trim();

  return { system, user };
}
