import { Controller, Get, Inject } from '@nestjs/common';
import { EnglishLevel, type MissionList } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { PRISMA } from '../db/prisma.module.js';
import { MissionSpec, objectivesOf } from './mission-rules.js';

const Scores = z.record(z.string(), z.number().int());

/** Missions with the learner's progress. Never includes prompts, hidden values or outcome rules. */
@Controller('missions')
export class MissionsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<MissionList> {
    const [missions, progress] = await Promise.all([
      this.prisma.scenario.findMany({
        where: { type: 'MISSION', isActive: true, publishedVersionId: { not: null } },
        orderBy: { sortOrder: 'asc' },
        include: { publishedVersion: true },
      }),
      this.prisma.missionProgress.findMany({ where: { userId: user.id } }),
    ]);
    return {
      missions: missions.flatMap((m) => {
        const v = m.publishedVersion!;
        const spec = MissionSpec.safeParse(v.mission);
        if (!spec.success) return [];
        const p = progress.find((x) => x.scenarioId === m.id);
        return [
          {
            id: m.id,
            slug: m.slug,
            group: spec.data.group,
            title: v.title,
            tagline: v.tagline,
            minLevel: EnglishLevel.parse(v.minLevel),
            estimatedMinutes: v.estimatedMinutes,
            aiCharacter: spec.data.aiCharacter,
            objectives: objectivesOf(v.goals).map((o) => o.text),
            skills: spec.data.skills,
            progress: {
              unlockedLevel: p?.unlockedLevel ?? 1,
              passedLevels: p?.passedLevels ?? [],
              bestScores: Scores.catch({}).parse(p?.bestScores ?? {}),
              attempts: p?.attempts ?? 0,
            },
          },
        ];
      }),
    };
  }
}
