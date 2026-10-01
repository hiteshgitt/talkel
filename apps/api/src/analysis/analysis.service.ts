import { Inject, Injectable, Logger } from '@nestjs/common';
import { EnglishLevel, FeedbackLanguage, MISSION_LEVELS, type MissionResult, type ReplayResult, type SkillKey } from '@speakai/contracts';
import type { Prisma, PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { renderTemplate } from '../engine/scenario-kinds.js';
import {
  buildEvaluationPrompt,
  buildReplayPrompt,
  clampEvaluation,
  clampReplayEvaluation,
  EVAL_PROMPT_VERSION,
  EvaluationOutput,
  evaluationJsonSchema,
  ReplayEvaluationOutput,
  replayEvaluationJsonSchema,
} from './evaluation.js';
import { generateStructured } from './gemini-text.js';
import { bandToScore, groundErrors, groundQuoted, overallScore } from './grounding.js';
import { LearningProfileService } from './learning-profile.service.js';
import { computeFluency } from './metrics.js';
import { applyAttempt, isPassed, MissionSpec, missionScore } from '../missions/mission-rules.js';
import { memoryApplies, planMemoryChanges } from '../memory/memory-rules.js';
import { localDateKey } from './progress-stats.js';

/** Below this, there is not enough English to give honest feedback. */
const MIN_USER_WORDS = 8;
const StoredState = z.object({ values: z.record(z.string(), z.union([z.string(), z.number()])) });
const Goals = z.array(z.object({ id: z.string(), description: z.string() }));
const ReplayContext = z.object({ question: z.string(), originalAnswer: z.string() });
/** A replay answer shorter than this is not worth comparing. */
const MIN_REPLAY_WORDS = 3;
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
    if (session.replayOfId) return this.analyseReplay(session);
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
      where: { type: 'PRACTICE', isActive: true, publishedVersionId: { not: null } },
      select: { slug: true, publishedVersion: { select: { title: true } } },
    });

    // Missions: the evaluator judges the outcome with the rule (rendered with the full state, incl. the AI's secrets).
    const spec = session.missionLevel !== null ? MissionSpec.safeParse(v.mission) : null;
    const mission =
      spec?.success && session.missionLevel !== null
        ? {
            level: session.missionLevel,
            levelName: MISSION_LEVELS[session.missionLevel - 1]?.name ?? '',
            aiCharacter: spec.data.aiCharacter,
            skills: spec.data.skills,
            outcome: render(spec.data.outcome),
          }
        : null;

    // Personal memory (opt-in): only for conversations where the user speaks as themselves.
    const memoryOn =
      Boolean(session.user.settings?.memoryEnabled) && memoryApplies({ kind: v.kind, missionLevel: session.missionLevel, isReplay: false });
    const existingMemories = memoryOn
      ? await this.prisma.userMemory.findMany({ where: { userId: session.userId }, orderBy: { updatedAt: 'desc' } })
      : [];
    const tz = session.user.profile?.timezone ?? 'Asia/Kolkata';

    const prompt = buildEvaluationPrompt({
      scenario: { title: v.title, kind: v.kind, userRole: render(v.userRole), objective: render(v.objective), briefing: render(v.briefing), slug: v.scenario.slug },
      goals,
      level: EnglishLevel.catch('INTERMEDIATE').parse(session.user.profile?.selfReportedLevel ?? session.difficulty),
      feedbackLanguage,
      turns: session.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, text: t.text })),
      fluency,
      availableScenarios: scenarios.map((s) => ({ slug: s.slug, title: s.publishedVersion?.title ?? s.slug })),
      mission,
      memory: memoryOn
        ? {
            existing: existingMemories.map((m) => ({ kind: m.kind, text: m.text })),
            today: `${localDateKey(new Date(), tz)} (${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(new Date())})`,
          }
        : null,
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
    const parsed = EvaluationOutput.safeParse(clampEvaluation(raw));
    if (!parsed.success) {
      throw new RetryableAnalysisError(`evaluation failed validation (${result.model}): ${parsed.error.issues[0]?.message}`);
    }
    const out = parsed.data;

    // Guardrails: keep only corrections that quote what the learner actually said, and known goals/scenarios.
    const said = new Map(userTurns.map((t) => [t.seq, t.text] as const));
    const { kept: grammarErrors, dropped: droppedErrors } = groundErrors(out.grammarErrors, said);
    const { kept: phrasing, dropped: droppedPhrasing } = groundQuoted(out.phrasing, said, (p) => p.original, (p) => p.better);
    const { kept: moments, dropped: droppedMoments } = groundQuoted(out.conversationMoments, said, (m) => m.youSaid, (m) => m.better);
    const dropped = droppedErrors + droppedPhrasing + droppedMoments;
    const goalIds = new Set(goals.map((g) => g.id));
    const achieved = [...new Set(out.goalsAchieved.filter((g) => goalIds.has(g)))];
    const slugs = new Set(scenarios.map((s) => s.slug));
    const recommendations = out.recommendations.map((r) => ({ ...r, scenarioSlug: r.scenarioSlug && slugs.has(r.scenarioSlug) ? r.scenarioSlug : null }));
    const bands = Object.fromEntries(Object.entries(out.skills).map(([k, s]) => [k, s.band])) as Record<SkillKey, number>;
    const overall = overallScore(bands);
    const memoryChanges = memoryOn ? planMemoryChanges(existingMemories, out.memory) : [];
    const remembered = memoryChanges.map((c) => ('update' in c ? c.update.text : c.create.text));
    const missionResult = mission ? this.missionResult(mission, out.mission, overall, achieved.length, goals.length) : null;
    const skills = Object.fromEntries(
      Object.entries(out.skills).map(([k, s]) => [k, { band: s.band, score: bandToScore(s.band), rationale: s.rationale }]),
    );

    await this.prisma.$transaction(async (tx) => {
      const analysis = await tx.sessionAnalysis.create({
        data: {
          sessionId,
          overallScore: overall,
          missionResult: missionResult ?? undefined,
          remembered,
          skills: skills as Prisma.InputJsonValue,
          summary: out.summary,
          strengths: out.strengths,
          focusAreas: out.focusAreas,
          conversationSkills: out.conversationSkills,
          translationPatterns: out.translationPatterns,
          phrasing,
          conversationMoments: moments,
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
      for (const change of memoryChanges) {
        if ('update' in change) {
          await tx.userMemory.updateMany({ where: { id: change.update.id, userId: session.userId }, data: { kind: change.update.kind, text: change.update.text, sourceSessionId: sessionId } });
        } else {
          await tx.userMemory.create({ data: { userId: session.userId, kind: change.create.kind, text: change.create.text, sourceSessionId: sessionId } });
        }
      }
      if (missionResult) {
        const scenarioId = v.scenarioId;
        const prev = await tx.missionProgress.findUnique({ where: { userId_scenarioId: { userId: session.userId, scenarioId } } });
        const next = applyAttempt(
          prev ? { unlockedLevel: prev.unlockedLevel, passedLevels: prev.passedLevels, bestScores: prev.bestScores as Record<string, number>, attempts: prev.attempts } : null,
          missionResult.level,
          missionResult.missionScore,
          missionResult.passed,
        );
        await tx.missionProgress.upsert({
          where: { userId_scenarioId: { userId: session.userId, scenarioId } },
          create: { userId: session.userId, scenarioId, ...next },
          update: next,
        });
      }
      await this.profiles.applyAnalysis(tx, session.userId, sessionId, {
        bands,
        errorCategories: grammarErrors.map((e) => e.category),
        fillerCounts: fluency.fillerCounts,
        speakingMs: fluency.userSpeakingMs,
      });
    });

    this.logger.log(`analysed ${sessionId} with ${result.model}: ${grammarErrors.length} corrections, ${phrasing.length} phrasing, ${moments.length} moments (${dropped} dropped), goals=${achieved.join(',') || '-'}`);
    return 'COMPLETED';
  }

  /** Replays: compare the new answer with the original one. Never touches the learning profile or missions. */
  private async analyseReplay(session: {
    id: string;
    userId: string;
    difficulty: string;
    replayResult: unknown;
    replayContext: unknown;
    scenarioState: unknown;
    turns: Array<{ speaker: string; text: string }>;
    scenarioVersion: { title: string; userRole: string; objective: string; briefing: string };
    user: { settings: { feedbackLanguage: string } | null };
  }): Promise<'COMPLETED' | 'SKIPPED' | 'ALREADY_DONE'> {
    if (session.replayResult) return 'ALREADY_DONE';
    const ctx = ReplayContext.parse(session.replayContext);
    const secondAnswer = session.turns.filter((t) => t.speaker === 'USER').map((t) => t.text.trim()).filter(Boolean).join(' ');
    if (secondAnswer.split(/\s+/).filter(Boolean).length < MIN_REPLAY_WORDS) {
      await this.prisma.conversationSession.update({ where: { id: session.id }, data: { analysisStatus: 'SKIPPED' } });
      return 'SKIPPED';
    }
    await this.prisma.conversationSession.update({ where: { id: session.id }, data: { analysisStatus: 'PROCESSING' } });
    const state = StoredState.parse(session.scenarioState).values;
    const render = (t: string) => renderTemplate(t, state);
    const v = session.scenarioVersion;
    const result = await generateStructured(
      { apiKey: this.env.GEMINI_API_KEY ?? '', baseUrl: this.env.GEMINI_API_BASE, models: this.env.EVAL_MODELS.split(',').map((m) => m.trim()).filter(Boolean) },
      buildReplayPrompt({
        scenario: { title: v.title, userRole: render(v.userRole), objective: render(v.objective), briefing: render(v.briefing) },
        level: EnglishLevel.catch('INTERMEDIATE').parse(session.difficulty),
        feedbackLanguage: FeedbackLanguage.catch('en').parse(session.user.settings?.feedbackLanguage),
        question: ctx.question,
        firstAnswer: ctx.originalAnswer,
        secondAnswer,
      }),
      replayEvaluationJsonSchema,
    );
    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      throw new RetryableAnalysisError(`replay evaluation returned invalid JSON (${result.model})`);
    }
    const parsed = ReplayEvaluationOutput.safeParse(clampReplayEvaluation(raw));
    if (!parsed.success) throw new RetryableAnalysisError(`replay evaluation failed validation (${result.model})`);
    const out = parsed.data;
    const replayResult: ReplayResult = {
      firstScore: bandToScore(out.first.band),
      secondScore: bandToScore(out.second.band),
      firstComment: out.first.comment,
      secondComment: out.second.comment,
      improved: out.improved,
      stillToWork: out.stillToWork,
      betterAnswer: out.betterAnswer,
    };
    await this.prisma.$transaction([
      this.prisma.conversationSession.update({ where: { id: session.id }, data: { analysisStatus: 'COMPLETED', replayResult } }),
      this.prisma.usageRecord.create({
        data: {
          userId: session.userId,
          sessionId: session.id,
          kind: 'EVALUATION',
          provider: 'gemini',
          model: result.model,
          inputTextTokens: result.usage.inputTokens,
          outputTextTokens: result.usage.outputTokens,
        },
      }),
    ]);
    this.logger.log(`replay ${session.id} compared with ${result.model}: ${replayResult.firstScore} → ${replayResult.secondScore}`);
    return 'COMPLETED';
  }

  /** The mission verdict. If the model left it out, fall back to the share of objectives achieved. */
  private missionResult(
    mission: { level: number; skills: readonly string[] },
    judged: EvaluationOutput['mission'],
    overall: number,
    achieved: number,
    total: number,
  ): MissionResult {
    const ratio = total > 0 ? achieved / total : 0;
    const result = judged?.result ?? (ratio >= 0.8 ? 'SUCCESS' : ratio >= 0.4 ? 'PARTIAL' : 'FAILED');
    return {
      level: mission.level,
      result,
      headline: judged?.headline ?? `Objectives achieved: ${achieved} of ${total}`,
      reason: judged?.reason ?? '',
      objectivesAchieved: achieved,
      objectivesTotal: total,
      missionScore: missionScore(overall, achieved, total),
      passed: isPassed(result),
      skills: (judged?.skills ?? [])
        .filter((sk) => mission.skills.includes(sk.key))
        .map((sk) => ({ key: sk.key, band: sk.band, score: bandToScore(sk.band), rationale: sk.rationale })),
    };
  }

  async markFailed(sessionId: string, reason: string): Promise<void> {
    this.logger.error(`analysis failed for ${sessionId}: ${reason}`);
    await this.prisma.conversationSession.updateMany({ where: { id: sessionId }, data: { analysisStatus: 'FAILED' } });
  }
}
