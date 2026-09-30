import { Controller, Get, Inject } from '@nestjs/common';
import { GrammarCategory, type Progress } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { PRISMA } from '../db/prisma.module.js';
import { smoothedBandToScore } from './grounding.js';

const CommonErrors = z.array(z.object({ category: z.string(), count: z.number() }));
const Fillers = z.record(z.string(), z.number());

/** The learner's evolving profile (PRD §34) for the Progress screen. */
@Controller('progress')
export class ProgressController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async progress(@CurrentUser() user: SessionUser): Promise<Progress> {
    const [p, recent] = await Promise.all([
      this.prisma.learningProfile.findUnique({ where: { userId: user.id } }),
      this.prisma.grammarError.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ]);
    // Smoothed bands (1–5) → 0–100 on the same scale as per-conversation skill scores.
    const score = (band: number | null | undefined) => (band == null ? null : smoothedBandToScore(band));
    return {
      analysedConversations: p?.analysedCount ?? 0,
      totalSpeakingMs: Number(p?.totalSpeakingMs ?? 0n),
      skills: {
        grammar: score(p?.grammarBand),
        vocabulary: score(p?.vocabularyBand),
        fluency: score(p?.fluencyBand),
        conversation: score(p?.conversationBand),
      },
      commonMistakes: CommonErrors.catch([])
        .parse(p?.commonErrors ?? [])
        .flatMap((e) => {
          const c = GrammarCategory.safeParse(e.category);
          return c.success ? [{ category: c.data, count: e.count }] : [];
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
}
