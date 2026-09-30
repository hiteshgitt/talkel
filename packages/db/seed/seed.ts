/**
 * Idempotent seed: categories, personas and scenarios (see ./content.ts).
 *
 *   pnpm --filter @speakai/db seed
 *
 * A scenario gets a NEW published version only when its content changed, so every conversation
 * keeps a reproducible link to the exact prompt it used (PRD §78).
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createPrismaClient } from '../dist/index.js';
import { PERSONAS, SCENARIOS, type ScenarioSeed } from '../dist/content.js';

if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

function versionContent(s: ScenarioSeed) {
  return {
    kind: s.kind,
    title: s.title,
    tagline: s.tagline,
    briefing: s.briefing,
    userRole: s.userRole,
    objective: s.objective,
    minLevel: s.minLevel,
    estimatedMinutes: s.estimatedMinutes,
    promptTemplate: s.promptTemplate,
    params: s.params,
    goals: s.goals,
  };
}

/** Key-order-independent JSON: Postgres jsonb reorders object keys, so plain JSON.stringify can't be compared. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

async function main(): Promise<void> {
  for (const p of PERSONAS) {
    const { slug, ...data } = p;
    const existing = await prisma.persona.findUnique({ where: { slug } });
    const changed =
      existing &&
      fingerprint({ ...data }) !==
        fingerprint({
          name: existing.name,
          gender: existing.gender,
          voices: existing.voices,
          description: existing.description,
          promptFragment: existing.promptFragment,
          sortOrder: existing.sortOrder,
        });
    await prisma.persona.upsert({
      where: { slug },
      create: { slug, ...data },
      update: { ...data, ...(changed ? { version: { increment: 1 } } : {}) },
    });
    console.log(`persona ${slug}${existing ? (changed ? ' (updated, new version)' : '') : ' (created)'}`);
  }

  for (const s of SCENARIOS) {
    const category = await prisma.scenarioCategory.upsert({
      where: { slug: s.category.slug },
      create: s.category,
      update: { name: s.category.name, sortOrder: s.category.sortOrder },
    });

    const scenario = await prisma.scenario.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, categoryId: category.id, sortOrder: s.sortOrder, isActive: true },
      update: { categoryId: category.id, sortOrder: s.sortOrder },
      include: { publishedVersion: true },
    });

    const content = versionContent(s);
    const current = scenario.publishedVersion;
    const stored = current && {
      kind: current.kind,
      title: current.title,
      tagline: current.tagline,
      briefing: current.briefing,
      userRole: current.userRole,
      objective: current.objective,
      minLevel: current.minLevel,
      estimatedMinutes: current.estimatedMinutes,
      promptTemplate: current.promptTemplate,
      params: current.params,
      goals: current.goals,
    };
    if (current && stored && fingerprint(stored) === fingerprint(content)) {
      console.log(`scenario ${s.slug} v${current.version} unchanged`);
      continue;
    }

    const last = await prisma.scenarioVersion.findFirst({ where: { scenarioId: scenario.id }, orderBy: { version: 'desc' } });
    const version = (last?.version ?? 0) + 1;
    await prisma.$transaction(async (tx) => {
      if (current) await tx.scenarioVersion.update({ where: { id: current.id }, data: { status: 'ARCHIVED' } });
      const created = await tx.scenarioVersion.create({
        data: { scenarioId: scenario.id, version, status: 'PUBLISHED', publishedAt: new Date(), ...content },
      });
      await tx.scenario.update({ where: { id: scenario.id }, data: { publishedVersionId: created.id } });
    });
    console.log(`scenario ${s.slug} published v${version}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
