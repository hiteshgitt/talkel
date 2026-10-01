import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { FeedbackLanguage, type SayItResult } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { clampToSchema, toGeminiSchema } from './evaluation.js';
import { EvaluationProviderError, generateStructured } from './gemini-text.js';
import { quotedIn } from './grounding.js';

export const REPHRASE_PROMPT_VERSION = 'say-it-3-ways-v2';

const Output = z.object({
  natural: z.string().min(1).max(250),
  professional: z.string().min(1).max(250),
  casual: z.string().min(1).max(250),
  tip: z.string().min(1).max(250),
});
const geminiSchema = toGeminiSchema(Output);

const LANGUAGE: Record<'en' | 'hi', string> = { en: 'English', hi: 'Hindi (Devanagari script, simple everyday Hindi)' };

/**
 * "Say it 3 ways": the same idea as natural, professional and casual spoken English. Generated on
 * demand (when the learner taps) and cached per conversation + sentence.
 */
@Injectable()
export class RephraseService {
  private readonly logger = new Logger(RephraseService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async sayIt(userId: string, sessionId: string, text: string): Promise<SayItResult> {
    const session = await this.prisma.conversationSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        turns: { where: { speaker: 'USER' }, select: { text: true } },
        scenarioVersion: { select: { title: true } },
        analysis: { include: { grammarErrors: true } },
        user: { include: { settings: true } },
        rephrasings: { where: { source: text } },
      },
    });
    if (!session) throw new ProblemException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
    const cached = session.rephrasings[0];
    if (cached) return Output.parse(cached.result);

    // Only sentences from this conversation or its feedback — this is not a general-purpose AI endpoint.
    const a = session.analysis;
    const fixes = [
      ...(a?.grammarErrors.map((e) => ({ fix: e.corrected, original: e.original })) ?? []),
      ...Phrasing.catch([]).parse(a?.phrasing ?? []).map((p) => ({ fix: p.better, original: p.original })),
    ];
    const candidates = [
      ...session.turns.map((t) => t.text),
      ...(a?.grammarErrors.flatMap((e) => [e.original, e.corrected]) ?? []),
      ...Phrasing.catch([]).parse(a?.phrasing ?? []).flatMap((p) => [p.original, p.better]),
      ...Moments.catch([]).parse(a?.conversationMoments ?? []).flatMap((m) => [m.youSaid, m.better]),
    ];
    if (!candidates.some((c) => quotedIn(text, c))) {
      throw new ProblemException(HttpStatus.BAD_REQUEST, 'NOT_FROM_CONVERSATION', 'This sentence is not from this conversation');
    }

    // Corrections are often fragments ("talking about cricket"): give the model the learner's whole
    // line, so the three versions say what they actually meant instead of a new sentence.
    const related = fixes.find((f) => quotedIn(text, f.fix));
    const line = session.turns.find((t) => quotedIn(related?.original ?? text, t.text))?.text;

    const lang = FeedbackLanguage.catch('en').parse(session.user.settings?.feedbackLanguage);
    const prompt = {
      system: `
You help an Indian learner of spoken English. Rewrite what they said in one line of a conversation in three registers of
natural SPOKEN English. Apply the improved wording you are given, keep their meaning and any facts (names, numbers)
exactly, and never add new ideas, questions or details. If their line is long, rewrite only the part around the improved
wording.
- natural: everyday, neutral — what a fluent speaker would usually say.
- professional: polished for work, interviews or customers — confident, not stiff or old-fashioned.
- casual: relaxed, with friends — contractions and common informal phrases, nothing rude.
Each version is one or two short sentences (at most about 30 words) and correct. If the input has mistakes, fix them.
tip: one short sentence, in ${LANGUAGE[lang]}, on which version fits this situation and why.`.trim(),
      user: [
        `SITUATION: ${session.scenarioVersion.title}`,
        line && line !== text ? `THEIR LINE IN THE CONVERSATION: ${line}` : null,
        `WHAT THEY WANT TO SAY (improved wording to build on): ${text}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
    let result;
    try {
      result = await generateStructured(
        { apiKey: this.env.GEMINI_API_KEY ?? '', baseUrl: this.env.GEMINI_API_BASE, models: this.env.EVAL_MODELS.split(',').map((m) => m.trim()).filter(Boolean), maxAttempts: 4, timeoutMs: 30_000 },
        prompt,
        geminiSchema,
      );
    } catch (err) {
      if (err instanceof EvaluationProviderError) {
        this.logger.warn(`say-it failed: ${err.message}`);
        throw new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'AI_BUSY', 'The AI is busy right now. Please try again in a moment.');
      }
      throw err;
    }
    const parsed = Output.safeParse(clampToSchema(Output, safeJson(result.text)));
    if (!parsed.success) throw new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'AI_BUSY', 'Couldn’t prepare this right now. Please try again.');

    await this.prisma.$transaction([
      this.prisma.rephrasing.upsert({
        where: { sessionId_source: { sessionId, source: text } },
        create: { sessionId, source: text, result: parsed.data, model: result.model },
        update: {},
      }),
      this.prisma.usageRecord.create({
        data: { userId, sessionId, kind: 'EVALUATION', provider: 'gemini', model: result.model, inputTextTokens: result.usage.inputTokens, outputTextTokens: result.usage.outputTokens },
      }),
    ]);
    return parsed.data;
  }
}

const Phrasing = z.array(z.object({ original: z.string(), better: z.string() }));
const Moments = z.array(z.object({ youSaid: z.string(), better: z.string() }));

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
