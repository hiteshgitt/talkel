import { Inject, Injectable } from '@nestjs/common';
import type { Quota } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { isValidTimeZone, nextLocalMidnight, startOfLocalDay } from './local-day.js';

/**
 * Daily free conversation time (PRD §55: no uncontrolled AI usage on free accounts).
 * Counted from finished conversations' usage records, per the user's local day.
 */
@Injectable()
export class QuotaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async forUser(userId: string, now = new Date()): Promise<Quota> {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { timezone: true } });
    const tz = profile && isValidTimeZone(profile.timezone) ? profile.timezone : 'Asia/Kolkata';
    const since = startOfLocalDay(now, tz);
    const used = await this.prisma.usageRecord.aggregate({
      where: { userId, kind: 'REALTIME', createdAt: { gte: since } },
      _sum: { billableSeconds: true },
    });
    const usedTodaySec = used._sum.billableSeconds ?? 0;
    const dailyLimitSec = this.env.FREE_DAILY_SECONDS;
    return {
      dailyLimitSec,
      usedTodaySec,
      remainingSec: Math.max(0, dailyLimitSec - usedTodaySec),
      resetsAt: nextLocalMidnight(now, tz).toISOString(),
    };
  }
}
