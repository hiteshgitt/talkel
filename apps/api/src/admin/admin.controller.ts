import { Controller, Get, Inject } from '@nestjs/common';
import type { PrismaClient } from '@speakai/db';
import { Roles } from '../auth/auth.decorators.js';
import { PRISMA } from '../db/prisma.module.js';

export interface AdminStats {
  users: number;
  verifiedUsers: number;
  onboardedUsers: number;
  signupsLast7Days: number;
}

/** Admin-only (role "admin"). Returns aggregates only — no personal data. */
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get('stats')
  async stats(): Promise<AdminStats> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, verifiedUsers, onboardedUsers, signupsLast7Days] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.profile.count({ where: { onboardedAt: { not: null } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);
    return { users, verifiedUsers, onboardedUsers, signupsLast7Days };
  }
}
