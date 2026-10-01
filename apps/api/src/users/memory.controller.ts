import { Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param } from '@nestjs/common';
import { MemoryKind, type MemoryList } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { ProblemException } from '../common/problem.js';
import { PRISMA } from '../db/prisma.module.js';

/** "What Talkel remembers": the user can see and delete every remembered fact. */
@Controller('me/memories')
export class MemoryController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<MemoryList> {
    const [settings, items] = await Promise.all([
      this.prisma.userSettings.findUnique({ where: { userId: user.id }, select: { memoryEnabled: true } }),
      this.prisma.userMemory.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
    ]);
    return {
      enabled: settings?.memoryEnabled ?? false,
      items: items.map((m) => ({
        id: m.id,
        kind: MemoryKind.catch('ABOUT').parse(m.kind),
        text: m.text,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    if (!z.string().uuid().safeParse(id).success) throw notFound();
    const { count } = await this.prisma.userMemory.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) throw notFound();
  }

  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() user: SessionUser): Promise<void> {
    await this.prisma.userMemory.deleteMany({ where: { userId: user.id } });
  }
}

const notFound = () => new ProblemException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
