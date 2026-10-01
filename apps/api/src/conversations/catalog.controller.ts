import { Controller, Get, Inject } from '@nestjs/common';
import { type Catalog, EnglishLevel, VoiceGender } from '@speakai/contracts';
import type { PrismaClient } from '@speakai/db';
import { AllowDevToken } from '../auth/auth.decorators.js';
import { PRISMA } from '../db/prisma.module.js';

/** Active practice scenarios (latest published version) and personas — missions have their own endpoint. Never includes prompts or hidden params. */
@Controller('catalog')
@AllowDevToken()
export class CatalogController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async catalog(): Promise<Catalog> {
    const [scenarios, personas] = await Promise.all([
      this.prisma.scenario.findMany({
        where: { type: 'PRACTICE', isActive: true, publishedVersionId: { not: null } },
        orderBy: { sortOrder: 'asc' },
        include: { category: true, publishedVersion: true },
      }),
      this.prisma.persona.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      scenarios: scenarios.map((s) => {
        const v = s.publishedVersion!;
        return {
          id: s.id,
          slug: s.slug,
          category: { slug: s.category.slug, name: s.category.name },
          title: v.title,
          tagline: v.tagline,
          minLevel: EnglishLevel.parse(v.minLevel),
          estimatedMinutes: v.estimatedMinutes,
        };
      }),
      personas: personas.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        gender: VoiceGender.parse(p.gender),
        description: p.description,
      })),
    };
  }
}
