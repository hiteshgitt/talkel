import { Inject, Injectable, Logger } from '@nestjs/common';
import { EnglishLevel, FeedbackLanguage, type SkillKey } from '@speakai/contracts';
import type { Prisma, PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { renderTemplate } from '../engine/scenario-kinds.js';
import { buildEvaluationPrompt, EVAL_PROMPT_VERSION, EvaluationOutput, evaluationJsonSchema } from './evaluation.js';
import { generateStructured } from './gemini-text.js';
import { bandToScore, groundErrors, overallScore } from './grounding.js';
import { LearningProfileService } from './learning-profile.service.js';
import { computeFluency } from './metrics.js';

/** Below this, there is not enough English to give honest feedback. */
const MIN_USER_WORDS = 8;
const StoredState = z.object({ values: z.record(z.string(), z.union([z.string(), z.number()])) });
const Goals = z.array(z.object({ id: z.string(), description: z.string() }));
const LiveMetrics = z.object({ userSpeakingMs: z.number(), responseLatenciesMs: z.array(z.number()) });

export class RetryableAnalysisError extends Error {}

/**
 * After-call feedback pipeline (docs/AI-ARCHITECTURE.md §6):
 * load → deterministic metrics → evaluation AI (structured) → validate → ground → persist → learning profile.
 * Idempotent: re-running for an analysed conversation does nothing.
 */
@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly profiles: LearningProfileService,
  ) {}

  async analyse(sessionId: string): Promise<'COMPLETED' | 'SKIPPED' | 'ALREADY_DONE' | 'GONE'> {
    const session = await this.prisma.conversationSession.findUnique({
      where: { id: sessionId },
      include: {
        analysis: { select: { id: true } },
        turns: { orderBy: { seq: 'asc' } },
        scenarioVersion: { include: { scenario: { select: { slug: true } } } },
        user: { include: { settings: true, profile: true } },
      },
    });
    if (!session) return 'GONE'; // deleted meanwhile
    if (session.analysis) return 'ALREADY_DONE';

    const userTurns = session.turns.filter((t) => t.speaker === 'USER');
    const live = LiveMetrics.safeParse(session.liveMetrics);
    const fluency = computeFluency(
      userTurns.map((t) => ({ seq: t.seq, text: t.text })),
      live.success ? live.data : { userSpeakingMs: session.userSpeakingMs ?? 0, responseLatenciesMs: [] },
    );
    if (fluency.userWords < MIN_USER_WORDS) {
      await this.prisma.conversationSession.update({ where: { id: sessionId }, data: { analysisStatus: 'SKIPPED' } });
      return 'SKIPPED';
    }

    await this.prisma.conversationSession.update({ where: { id: sessionId }, data: { analysisStatus: 'PROCESSING' } });
    const v = session.scenarioVersion;
    const state = StoredState.parse(session.scenarioState).values;
    const render = (t: string) => renderTemplate(t, state);
    const goals = Goals.parse(v.goals);
    const feedbackLanguage = FeedbackLanguage.catch('en').parse(session.user.settings?.feedbackLanguage);
    const scenarios = await this.prisma.scenario.findMany({
      where: { isActive: true, publishedVersionId: { not: null } },
      select: { slug: true, publishedVersion: { select: { title: true } } },
    });

    const prompt = buildEvaluationPrompt({
      scenario: { title: v.title, kind: v.kind, userRole: render(v.userRole), objective: render(v.objective), briefing: render(v.briefing), slug: v.scenario.slug },
      goals,
      level: EnglishLevel.catch('INTERMEDIATE').parse(session.user.profile?.selfReportedLevel ?? session.difficulty),
      feedbackLanguage,
      turns: session.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, text: t.text })),
      fluency,
      availableScenarios: scenarios.map((s) => ({ slug: s.slug, title: s.publishedVersion?.title ?? s.slug })),
    });

    const result = await generateStructured(
      {
        apiKey: this.env.GEMINI_API_KEY ?? '',
        baseUrl: this.env.GEMINI_API_BASE,
        models: this.env.EVAL_MODELS.split(',').map((m) => m.trim()).filter(Boolean),
      },
      prompt,
      evaluationJsonSchema,
    );
    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      throw new RetryableAnalysisError(`evaluation returned invalid JSON (${result.model})`);
    }
    const parsed = EvaluationOutput.safeParse(raw);
    if (!parsed.success) {
      throw new RetryableAnalysisError(`evaluation failed validation (${result.model}): ${parsed.error.issues[0]?.message}`);
    }
    const out = parsed.data;

    // Guardrails: keep only corrections that quote what the learner actually said, and known goals/scenarios.
    const said = new Map(userTurns.map((t) => [t.seq, t.text] as const));
    const { kept: grammarErrors, dropped } = groundErrors(out.grammarErrors, said);
    const goalIds = new Set(goals.map((g) => g.id));
    const achieved = [...new Set(out.goalsAchieved.filter((g) => goalIds.has(g)))];
    const slugs = new Set(scenarios.map((s) => s.slug));
    const recommendations = out.recommendations.map((r) => ({ ...r, scenarioSlug: r.scenarioSlug && slugs.has(r.scenarioSlug) ? r.scenarioSlug : null }));
    const bands = Object.fromEntries(Object.entries(out.skills).map(([k, s]) => [k, s.band])) as Record<SkillKey, number>;
    const skills = Object.fromEntries(
      Object.entries(out.skills).map(([k, s]) => [k, { band: s.band, score: bandToScore(s.band), rationale: s.rationale }]),
    );

    await this.prisma.$transaction(async (tx) => {
      const analysis = await tx.sessionAnalysis.create({
        data: {
          sessionId,
          overallScore: overallScore(bands),
          skills: skills as Prisma.InputJsonValue,
          summary: out.summary,
          strengths: out.strengths,
          focusAreas: out.focusAreas,
          conversationSkills: out.conversationSkills,
          translationPatterns: out.translationPatterns,
          feedbackLanguage,
          evalModel: result.model,
          evalPromptVersion: EVAL_PROMPT_VERSION,
          groundingDropped: dropped,
        },
      });
      if (grammarErrors.length) {
        await tx.grammarError.createMany({ data: grammarErrors.map((e) => ({ ...e, analysisId: analysis.id, userId: session.userId })) });
      }
      if (out.vocabulary.length) {
        await tx.vocabularyItem.createMany({ data: out.vocabulary.map((v) => ({ ...v, analysisId: analysis.id, userId: session.userId })) });
      }
      await tx.fluencyMetrics.create({ data: { analysisId: analysis.id, ...fluency, fillerCounts: fluency.fillerCounts } });
      if (recommendations.length) {
        await tx.practiceRecommendation.createMany({ data: recommendations.map((r) => ({ ...r, analysisId: analysis.id })) });
      }
      await tx.conversationSession.update({ where: { id: sessionId }, data: { analysisStatus: 'COMPLETED', goalsAchieved: achieved } });
      await tx.usageRecord.create({
        data: {
          userId: session.userId,
          sessionId,
          kind: 'EVALUATION',
          provider: 'gemini',
          model: result.model,
          inputTextTokens: result.usage.inputTokens,
          outputTextTokens: result.usage.outputTokens,
        },
      });
      await this.profiles.applyAnalysis(tx, session.userId, sessionId, {
        bands,
        errorCategories: grammarErrors.map((e) => e.category),
        fillerCounts: fluency.fillerCounts,
        speakingMs: fluency.userSpeakingMs,
      });
    });

    this.logger.log(`analysed ${sessionId} with ${result.model}: ${grammarErrors.length} corrections (${dropped} dropped), goals=${achieved.join(',') || '-'}`);
    return 'COMPLETED';
  }

  async markFailed(sessionId: string, reason: string): Promise<void> {
    this.logger.error(`analysis failed for ${sessionId}: ${reason}`);
    await this.prisma.conversationSession.updateMany({ where: { id: sessionId }, data: { analysisStatus: 'FAILED' } });
  }
}
