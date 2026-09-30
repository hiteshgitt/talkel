/**
 * Worker process (second entrypoint of the API codebase; docs/ARCHITECTURE.md §3):
 * runs queued jobs such as after-call analysis, so the API never waits on slow AI calls.
 *
 *   node dist/worker.js
 */
import 'reflect-metadata';
import { join } from 'node:path';
import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { UnrecoverableError, Worker } from 'bullmq';
import { ANALYSIS_QUEUE_NAME, type AnalysisJob, redisConnection } from './analysis/analysis-queue.js';
import { AnalysisService, RetryableAnalysisError } from './analysis/analysis.service.js';
import { LearningProfileService } from './analysis/learning-profile.service.js';
import { EvaluationProviderError } from './analysis/gemini-text.js';
import { ENV, type Env, loadEnv, withDotEnv } from './config/env.js';
import { PrismaModule } from './db/prisma.module.js';

@Module({})
class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [{ module: EnvModule, global: true, providers: [{ provide: ENV, useValue: env }], exports: [ENV] }, PrismaModule],
      providers: [AnalysisService, LearningProfileService],
    };
  }
}
@Module({})
class EnvModule {}

const dotEnvPath = process.env.DOTENV_PATH ?? join(import.meta.dirname, '..', '.env');
const env = loadEnv(withDotEnv(process.env, dotEnvPath));
const logger = new Logger('worker');
const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env));
app.enableShutdownHooks();
const analysis = app.get(AnalysisService);

const worker = new Worker<AnalysisJob>(
  ANALYSIS_QUEUE_NAME,
  async (job) => {
    try {
      return await analysis.analyse(job.data.sessionId);
    } catch (err) {
      const retryable = err instanceof RetryableAnalysisError || (err instanceof EvaluationProviderError && err.retryable);
      const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!retryable || last) await analysis.markFailed(job.data.sessionId, (err as Error).message);
      // Non-retryable (e.g. invalid request): stop here instead of burning the remaining attempts.
      if (!retryable) throw new UnrecoverableError((err as Error).message);
      throw err;
    }
  },
  { connection: redisConnection(env.REDIS_URL), concurrency: 2 },
);
worker.on('failed', (job, err) => logger.warn(`job ${job?.id} attempt ${job?.attemptsMade} failed: ${err.message}`));
worker.on('ready', () => logger.log('analysis worker ready'));

const shutdown = async () => {
  await worker.close();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
