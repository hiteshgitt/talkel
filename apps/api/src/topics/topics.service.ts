import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { CustomTopic, TopicInput, TopicList } from '@speakai/contracts';
import type { Prisma, PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { clampToSchema } from '../analysis/evaluation.js';
import { EvaluationProviderError, generateStructured } from '../analysis/gemini-text.js';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { entitlementsFor } from '../users/users.service.js';
import { BuiltTopic, builtTopicSchema, StoredTopicParams, TOPIC_SYSTEM_PROMPT, topicUserPrompt, topicVersion } from './topic-builder.js';

/** Even "unlimited" has a ceiling, against abuse. */
const MAX_TOPICS = 50;
/** Creating or changing a topic calls the AI: at most this many attempts per user per day. */
export const TOPIC_CHANGES_PER_DAY = 20;

const CATEGORY: Record<TopicInput['area'], { name: string; sortOrder: number }> = {
  everyday: { name: 'Everyday', sortOrder: 1 },
  work: { name: 'Work', sortOrder: 2 },
  'real-life': { name: 'Real life', sortOrder: 3 },
};

const Goals = z.array(z.object({ id: z.string(), description: z.string(), label: z.string().optional() }));

type TopicRow = Prisma.ScenarioGetPayload<{ include: { publishedVersion: true } }>;

/**
 * Custom topics: private practice scenarios a user describes in their own words. Each one is a
 * scenario owned by that user, so calls, feedback, history and replays work as for any scenario.
 * Free plan: one topic; Pro: unlimited.
 */
@Injectable()
export class TopicsService {
  private readonly logger = new Logger(TopicsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(userId: string): Promise<TopicList> {
    const [rows, user] = await Promise.all([
      this.prisma.scenario.findMany({
        where: { ownerId: userId, isActive: true, publishedVersionId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        include: { publishedVersion: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } }),
    ]);
    const practised = await this.practisedCounts(userId);
    const limit = entitlementsFor(user.plan).customTopics;
    return {
      topics: rows.map((r) => toTopic(r, practised.get(r.id) ?? 0)),
      limit,
      canCreate: rows.length < Math.min(limit ?? MAX_TOPICS, MAX_TOPICS),
    };
  }

  async create(userId: string, input: TopicInput): Promise<CustomTopic> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
    const limit = entitlementsFor(user.plan).customTopics;
    const count = await this.prisma.scenario.count({ where: { ownerId: userId, isActive: true } });
    if (count >= Math.min(limit ?? MAX_TOPICS, MAX_TOPICS)) {
      throw limit === null
        ? new ProblemException(HttpStatus.FORBIDDEN, 'TOPIC_LIMIT', `You can keep up to ${MAX_TOPICS} topics. Delete one to add another.`)
        : new ProblemException(HttpStatus.FORBIDDEN, 'TOPIC_LIMIT', 'The free plan includes 1 custom topic. Edit or delete it, or go Pro for unlimited topics.');
    }
    const version = await this.build(userId, input);
    const category = await this.category(input.area);

    const id = await this.prisma.$transaction(async (tx) => {
      const scenario = await tx.scenario.create({
        data: { slug: `topic-${randomUUID()}`, type: 'PRACTICE', categoryId: category, ownerId: userId, isActive: true },
      });
      const v = await tx.scenarioVersion.create({
        data: { scenarioId: scenario.id, version: 1, status: 'PUBLISHED', publishedAt: new Date(), ...version },
      });
      await tx.scenario.update({ where: { id: scenario.id }, data: { publishedVersionId: v.id } });
      return scenario.id;
    });
    return this.get(userId, id);
  }

  async update(userId: string, id: string, input: TopicInput): Promise<CustomTopic> {
    const topic = await this.owned(userId, id);
    const version = await this.build(userId, input);
    const category = await this.category(input.area);
    const last = await this.prisma.scenarioVersion.aggregate({ where: { scenarioId: id }, _max: { version: true } });

    // A new version: past conversations keep the exact scenario they used.
    await this.prisma.$transaction(async (tx) => {
      if (topic.publishedVersionId) await tx.scenarioVersion.update({ where: { id: topic.publishedVersionId }, data: { status: 'ARCHIVED' } });
      const v = await tx.scenarioVersion.create({
        data: { scenarioId: id, version: (last._max.version ?? 0) + 1, status: 'PUBLISHED', publishedAt: new Date(), ...version },
      });
      await tx.scenario.update({ where: { id }, data: { publishedVersionId: v.id, categoryId: category } });
    });
    return this.get(userId, id);
  }

  /** Deleted for good when no conversation used it; otherwise hidden until those conversations are deleted. */
  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    const used = await this.prisma.conversationSession.count({ where: { scenarioVersion: { scenarioId: id } } });
    if (used > 0) await this.prisma.scenario.update({ where: { id }, data: { isActive: false } });
    else await this.prisma.scenario.delete({ where: { id } });
  }

  private async get(userId: string, id: string): Promise<CustomTopic> {
    const row = await this.prisma.scenario.findUniqueOrThrow({ where: { id }, include: { publishedVersion: true } });
    return toTopic(row, (await this.practisedCounts(userId)).get(id) ?? 0);
  }

  private async owned(userId: string, id: string) {
    const topic = z.string().uuid().safeParse(id).success
      ? await this.prisma.scenario.findFirst({ where: { id, ownerId: userId, isActive: true } })
      : null;
    if (!topic) throw new ProblemException(HttpStatus.NOT_FOUND, 'TOPIC_NOT_FOUND', 'Topic not found');
    return topic;
  }

  private async category(area: TopicInput['area']): Promise<string> {
    const c = CATEGORY[area];
    const row = await this.prisma.scenarioCategory.upsert({ where: { slug: area }, create: { slug: area, ...c }, update: {} });
    return row.id;
  }

  private async practisedCounts(userId: string): Promise<Map<string, number>> {
    const sessions = await this.prisma.conversationSession.findMany({
      where: { userId, status: 'ENDED', replayOfId: null, scenarioVersion: { scenario: { ownerId: userId } } },
      select: { scenarioVersion: { select: { scenarioId: true } } },
    });
    const counts = new Map<string, number>();
    for (const s of sessions) counts.set(s.scenarioVersion.scenarioId, (counts.get(s.scenarioVersion.scenarioId) ?? 0) + 1);
    return counts;
  }

  /** Asks the AI to write the scenario and check it is suitable. Every attempt counts towards the daily limit. */
  private async build(userId: string, input: TopicInput) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const recent = await this.prisma.usageRecord.count({ where: { userId, kind: 'TOPIC', createdAt: { gte: since } } });
    if (recent >= TOPIC_CHANGES_PER_DAY) {
      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, 'TOPIC_RATE_LIMIT', 'You’ve created or changed a lot of topics today. Please try again tomorrow.');
    }

    let result;
    try {
      result = await generateStructured(
        {
          apiKey: this.env.GEMINI_API_KEY ?? '',
          baseUrl: this.env.GEMINI_API_BASE,
          models: this.env.EVAL_MODELS.split(',').map((m) => m.trim()).filter(Boolean),
          // Every model once (busy free-tier models are common), so the user isn't left waiting long.
          maxAttempts: this.env.EVAL_MODELS.split(',').filter((m) => m.trim()).length,
          timeoutMs: 30_000,
          // The user is waiting on screen: a busy model is skipped at once instead of backing off.
          sleep: () => new Promise((r) => setTimeout(r, 250)),
        },
        { system: TOPIC_SYSTEM_PROMPT, user: topicUserPrompt(input) },
        builtTopicSchema,
      );
    } catch (err) {
      if (err instanceof EvaluationProviderError) {
        this.logger.warn(`topic builder failed: ${err.message}`);
        throw new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'AI_BUSY', 'The AI is busy right now. Please try again in a moment.');
      }
      throw err;
    }
    await this.prisma.usageRecord.create({
      data: { userId, kind: 'TOPIC', provider: 'gemini', model: result.model, inputTextTokens: result.usage.inputTokens, outputTextTokens: result.usage.outputTokens },
    });

    const parsed = BuiltTopic.safeParse(clampToSchema(BuiltTopic, safeJson(result.text)));
    if (!parsed.success) throw new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'AI_BUSY', 'Couldn’t build this topic right now. Please try again.');
    if (!parsed.data.allowed) {
      const reason = parsed.data.rejectReason.trim() || 'This topic can’t be practised in Talkel. Please describe a different situation.';
      throw new ProblemException(HttpStatus.UNPROCESSABLE_ENTITY, 'TOPIC_NOT_ALLOWED', reason);
    }
    const version = topicVersion(input, parsed.data);
    if (!version) throw new ProblemException(HttpStatus.UNPROCESSABLE_ENTITY, 'TOPIC_UNCLEAR', 'Please describe the situation in a bit more detail.');
    return version;
  }
}

function toTopic(row: TopicRow, practised: number): CustomTopic {
  const v = row.publishedVersion!;
  const stored = StoredTopicParams.parse(v.params);
  return {
    id: row.id,
    slug: row.slug,
    area: stored.topic.area,
    title: v.title,
    tagline: v.tagline,
    briefing: v.briefing,
    userRole: v.userRole,
    objective: v.objective,
    aiCharacter: stored.aiCharacter,
    goals: Goals.parse(v.goals).map((g) => g.label ?? g.description),
    input: stored.topic,
    practised,
    createdAt: row.createdAt.toISOString(),
    updatedAt: v.createdAt.toISOString(),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
