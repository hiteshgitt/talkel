import { Inject, Injectable } from '@nestjs/common';
import type { SkillKey } from '@speakai/contracts';
import type { Prisma, PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { PRISMA } from '../db/prisma.module.js';

/** Recent conversations count more: exponential moving average weight for the newest one. */
const ALPHA = 0.35;
const TOP_ERRORS = 8;

const CommonErrors = z.array(z.object({ category: z.string(), count: z.number(), lastSeenAt: z.string() }));
const Fillers = z.record(z.string(), z.number());

export interface AnalysisDigest {
  bands: Record<SkillKey, number>;
  errorCategories: string[];
  fillerCounts: Record<string, number>;
  speakingMs: number;
}

/**
 * The learner's evolving profile (PRD §34). Updated inside the analysis transaction; idempotent per
 * conversation. Its weak spots feed the next conversation's instructions (PRD §35).
 */
@Injectable()
export class LearningProfileService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async applyAnalysis(tx: Prisma.TransactionClient, userId: string, sessionId: string, d: AnalysisDigest): Promise<void> {
    const current = await tx.learningProfile.findUnique({ where: { userId } });
    if (current?.lastAnalysedSessionId === sessionId) return;

    const ema = (prev: number | null | undefined, next: number) => (prev == null ? next : Math.round((prev * (1 - ALPHA) + next * ALPHA) * 100) / 100);
    const now = new Date().toISOString();
    const errors = CommonErrors.catch([]).parse(current?.commonErrors ?? []);
    for (const category of d.errorCategories) {
      const e = errors.find((x) => x.category === category);
      if (e) {
        e.count++;
        e.lastSeenAt = now;
      } else errors.push({ category, count: 1, lastSeenAt: now });
    }
    errors.sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt));
    const fillers = Fillers.catch({}).parse(current?.commonFillers ?? {});
    for (const [k, n] of Object.entries(d.fillerCounts)) fillers[k] = (fillers[k] ?? 0) + n;

    const data = {
      grammarBand: ema(current?.grammarBand, d.bands.grammar),
      vocabularyBand: ema(current?.vocabularyBand, d.bands.vocabulary),
      fluencyBand: ema(current?.fluencyBand, d.bands.fluency),
      conversationBand: ema(current?.conversationBand, d.bands.conversation),
      commonErrors: errors.slice(0, TOP_ERRORS),
      commonFillers: fillers,
      analysedCount: (current?.analysedCount ?? 0) + 1,
      totalSpeakingMs: (current?.totalSpeakingMs ?? 0n) + BigInt(Math.round(d.speakingMs)),
      lastAnalysedSessionId: sessionId,
    };
    await tx.learningProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  /** The learner's most frequent mistake categories (for the next conversation's learner layer). */
  async weakSpots(userId: string, limit = 2): Promise<string[]> {
    const p = await this.prisma.learningProfile.findUnique({ where: { userId }, select: { commonErrors: true } });
    return CommonErrors.catch([]).parse(p?.commonErrors ?? []).filter((e) => e.count >= 2).slice(0, limit).map((e) => e.category);
  }
}
