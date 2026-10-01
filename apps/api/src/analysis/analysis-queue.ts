import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

export const ANALYSIS_QUEUE_NAME = 'analysis';

export interface AnalysisJob {
  sessionId: string;
}

export function redisConnection(url: string): Redis {
  // BullMQ requires maxRetriesPerRequest: null for blocking commands.
  return new Redis(url, { maxRetriesPerRequest: null });
}

/** Producer side: the API enqueues finished conversations; the worker process consumes them. */
@Injectable()
export class AnalysisQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(AnalysisQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue<AnalysisJob>;

  constructor(@Inject(ENV) env: Env) {
    this.connection = redisConnection(env.REDIS_URL);
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
