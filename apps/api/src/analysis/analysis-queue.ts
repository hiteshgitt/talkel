import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@speakai/db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const ANALYSIS_QUEUE_NAME = 'analysis';

export interface AnalysisJob {
  sessionId: string;
}

export function redisConnection(url: string): Redis {
  // BullMQ requires maxRetriesPerRequest: null for blocking commands.
  return new Redis(url, { maxRetriesPerRequest: null });
}

/** Producer side: the API enqueues finished conversations; a worker consumes them. */
export abstract class AnalysisQueue {
  abstract enqueue(sessionId: string, opts?: { force?: boolean }): Promise<void>;
}

/** BullMQ on Redis (development, tests, or any always-on deployment). */
export class RedisAnalysisQueue extends AnalysisQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisAnalysisQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue<AnalysisJob>;

  constructor(redisUrl: string) {
    super();
    this.connection = redisConnection(redisUrl);
    this.queue = new Queue<AnalysisJob>(ANALYSIS_QUEUE_NAME, { connection: this.connection });
  }

  /** One job per conversation (jobId = sessionId), retried with backoff (20 s … 5 min, ~10 min in total) if the AI provider is busy. */
  async enqueue(sessionId: string, opts: { force?: boolean } = {}): Promise<void> {
    if (opts.force) await this.queue.remove(sessionId).catch(() => undefined);
    await this.queue.add(
      'analyse',
      { sessionId },
      { jobId: sessionId, attempts: 6, backoff: { type: 'exponential', delay: 20_000 }, removeOnComplete: 1000, removeOnFail: 1000 },
    );
    this.logger.log(`queued analysis for ${sessionId}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}

/**
 * The queue as columns on the conversation (QUEUE_DRIVER=postgres): no Redis needed, and nothing
 * polls while no request is running — fits Cloud Run's request-based free tier.
 */
export class DbAnalysisQueue extends AnalysisQueue {
  private readonly logger = new Logger(DbAnalysisQueue.name);

  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async enqueue(sessionId: string, opts: { force?: boolean } = {}): Promise<void> {
    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: { analysisNextAt: new Date(), analysisLockedUntil: null, ...(opts.force ? { analysisAttempts: 0 } : {}) },
    });
    this.logger.log(`queued analysis for ${sessionId}`);
  }
}

