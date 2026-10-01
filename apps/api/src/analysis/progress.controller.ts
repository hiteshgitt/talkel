import { Controller, Get, HttpStatus, Inject, Param } from '@nestjs/common';
import { GrammarCategory, type MistakeList, type Progress, SkillKey } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { ProblemException } from '../common/problem.js';
import { isValidTimeZone } from '../conversations/local-day.js';
import { PRISMA } from '../db/prisma.module.js';
import { smoothedBandToScore } from './grounding.js';
import { ALPHA } from './learning-profile.service.js';
import { confidenceIndicators, emaBand, mistakeTrends, practiceSummary } from './progress-stats.js';

const CommonErrors = z.array(z.object({ category: z.string(), count: z.number() }));
const Fillers = z.record(z.string(), z.number());
const StoredSkills = z.partialRecord(SkillKey, z.object({ band: z.number(), score: z.number() }));
const StoredConversationSkills = z.object({ askedQuestions: z.boolean().nullable().optional() });

/** Conversations shown in the trends. */
const HISTORY = 20;
/** How far back streaks are counted. */
const STREAK_LOOKBACK_DAYS = 400;

/** The learner's evolving profile (PRD §34) for the Progress screen. */
@Controller('progress')
export class ProgressController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async progress(@CurrentUser() user: SessionUser): Promise<Progress> {
    const now = new Date();
    const [p, profile, analyses, usage, recent] = await Promise.all([
      this.prisma.learningProfile.findUnique({ where: { userId: user.id } }),
      this.prisma.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } }),
      this.prisma.sessionAnalysis.findMany({
        where: { session: { userId: user.id } },
        orderBy: { createdAt: 'desc' },
        take: HISTORY,
        include: {
          fluency: true,
          grammarErrors: { select: { category: true } },
          session: { select: { id: true, createdAt: true, userSpeakingMs: true, scenarioVersion: { select: { title: true } } } },
        },
      }),
      this.prisma.usageRecord.findMany({
        where: { userId: user.id, kind: 'REALTIME', createdAt: { gte: new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86_400_000) } },
        select: { createdAt: true, billableSeconds: true },
      }),
      this.prisma.grammarError.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    const tz = profile && isValidTimeZone(profile.timezone) ? profile.timezone : 'Asia/Kolkata';
    analyses.reverse(); // oldest first

    // Smoothed bands (1–5) → 0–100 on the same scale as per-conversation skill scores.
    const score = (band: number | null | undefined) => (band == null ? null : smoothedBandToScore(band));
    const history = analyses.map((a) => {
      const skills = StoredSkills.catch({}).parse(a.skills);
      const skillScore = (k: SkillKey) => skills[k]?.score ?? null;
      return {
        conversationId: a.session.id,
        createdAt: a.session.createdAt.toISOString(),
        scenarioTitle: a.session.scenarioVersion.title,
        overall: a.overallScore,
        skills: {
          grammar: skillScore('grammar'),
          vocabulary: skillScore('vocabulary'),
          fluency: skillScore('fluency'),
          conversation: skillScore('conversation'),
          clarity: skillScore('clarity'),
        },
        bands: skills,
        wordsPerMinute: a.fluency?.wordsPerMinute ?? null,
        mistakes: a.grammarErrors.length,
      };
    });
    const clarityBands = history.flatMap((h) => (h.bands.clarity ? [h.bands.clarity.band] : []));

    const trends = mistakeTrends(analyses.map((a) => a.grammarErrors.map((e) => e.category)));
    const signals = analyses.map((a) => ({
      latencyP50Ms: a.fluency?.latencyP50Ms ?? null,
      meanUtteranceWords: a.fluency?.meanUtteranceWords ?? 0,
      longPauseCount: a.fluency?.longPauseCount ?? 0,
      userSpeakingMs: a.fluency?.userSpeakingMs ?? a.session.userSpeakingMs ?? 0,
      fillersPerMinute: a.fluency?.fillersPerMinute ?? null,
      askedQuestions: StoredConversationSkills.catch({}).parse(a.conversationSkills).askedQuestions ?? null,
    }));

    return {
      analysedConversations: p?.analysedCount ?? 0,
      totalSpeakingMs: Number(p?.totalSpeakingMs ?? 0n),
      skills: {
        grammar: score(p?.grammarBand),
        vocabulary: score(p?.vocabularyBand),
        fluency: score(p?.fluencyBand),
        conversation: score(p?.conversationBand),
        clarity: score(emaBand(clarityBands, ALPHA)),
      },
      ...practiceSummary(
        usage.map((u) => ({ createdAt: u.createdAt, seconds: u.billableSeconds })),
        tz,
        now,
      ),
      history: history.map(({ bands: _bands, ...h }) => h),
      confidence: confidenceIndicators(signals),
      commonMistakes: CommonErrors.catch([])
        .parse(p?.commonErrors ?? [])
        .flatMap((e) => {
          const c = GrammarCategory.safeParse(e.category);
          return c.success ? [{ category: c.data, count: e.count, trend: trends.get(c.data) ?? null }] : [];
        })
        .slice(0, 5),
      commonFillers: Object.entries(Fillers.catch({}).parse(p?.commonFillers ?? {}))
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      recentCorrections: recent.flatMap((e) => {
        const c = GrammarCategory.safeParse(e.category);
        return c.success ? [{ original: e.original, corrected: e.corrected, category: c.data }] : [];
      }),
    };
  }

  /** Every correction of one mistake type (newest first), to review them together. */
  @Get('mistakes/:category')
  async mistakes(@CurrentUser() user: SessionUser, @Param('category') raw: string): Promise<MistakeList> {
    const category = GrammarCategory.safeParse(raw);
    if (!category.success) throw new ProblemException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown mistake type');
    const rows = await this.prisma.grammarError.findMany({
      where: { userId: user.id, category: category.data },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { analysis: { select: { session: { select: { id: true, scenarioVersion: { select: { title: true } } } } } } },
    });
    return {
      category: category.data,
      items: rows.map((e) => ({
        original: e.original,
        corrected: e.corrected,
        explanation: e.explanation,
        createdAt: e.createdAt.toISOString(),
        conversationId: e.analysis.session.id,
        scenarioTitle: e.analysis.session.scenarioVersion.title,
      })),
    };
  }
}
