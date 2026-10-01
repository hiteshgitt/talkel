import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { PrismaClient } from '@speakai/db';
import type { Response } from 'express';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { PRISMA } from '../db/prisma.module.js';
import { UsersService } from '../users/users.service.js';

/**
 * DPDP data access: everything we store about the user, as one JSON file. Audio recordings are
 * listed (they can be played or downloaded from each conversation) rather than embedded.
 */
@Controller('me/export')
export class ExportController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly users: UsersService,
    private readonly conversations: ConversationsService,
  ) {}

  @Get()
  async export(@CurrentUser() user: SessionUser, @Res() res: Response): Promise<void> {
    const [me, account, sessions, learning, missions, memories, usage] = await Promise.all([
      this.users.me(user.id),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true, accounts: { select: { providerId: true, createdAt: true } } } }),
      this.prisma.conversationSession.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { id: true } }),
      this.prisma.learningProfile.findUnique({ where: { userId: user.id } }),
      this.prisma.missionProgress.findMany({ where: { userId: user.id }, include: { scenario: { select: { slug: true } } } }),
      this.prisma.userMemory.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.usageRecord.groupBy({ by: ['kind'], where: { userId: user.id }, _sum: { billableSeconds: true }, _count: true }),
    ]);

    const conversations = [];
    for (const s of sessions) conversations.push(await this.conversations.detail(user.id, s.id));

    const data = {
      exportedAt: new Date().toISOString(),
      about: 'Everything Talkel stores about your account. Recordings are listed per conversation; play or download them in the app.',
      account: { ...me.user, createdAt: account.createdAt.toISOString(), signInMethods: account.accounts.map((a) => a.providerId) },
      profile: me.profile,
      settings: me.settings,
      learningProfile: learning ? { ...learning, totalSpeakingMs: Number(learning.totalSpeakingMs) } : null,
      missionProgress: missions.map((m) => ({
        mission: m.scenario.slug,
        unlockedLevel: m.unlockedLevel,
        passedLevels: m.passedLevels,
        bestScores: m.bestScores,
        attempts: m.attempts,
      })),
      memories: memories.map((m) => ({ kind: m.kind, text: m.text, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })),
      usage: usage.map((u) => ({ kind: u.kind, records: u._count, seconds: u._sum.billableSeconds ?? 0 })),
      conversations,
    };
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="talkel-data-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(JSON.stringify(data, null, 2));
  }
}
