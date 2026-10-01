/**
 * Worker process (second entrypoint of the API codebase; docs/ARCHITECTURE.md §3):
 * runs queued jobs such as after-call analysis, so the API never waits on slow AI calls.
 *
 *   node dist/worker.js
 */
import 'reflect-metadata';
import { join } from 'node:path';
import { type DynamicModule, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { startAnalysisWorker } from './analysis/analysis-worker.js';
import { AnalysisService } from './analysis/analysis.service.js';
import { DbAnalysisWorker } from './analysis/db-analysis-worker.js';
import type { PrismaClient } from '@speakai/db';
import { LearningProfileService } from './analysis/learning-profile.service.js';
import { ENV, type Env, loadEnv, withDotEnv } from './config/env.js';
import { PRISMA, PrismaModule } from './db/prisma.module.js';

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
const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env));
app.enableShutdownHooks();
const analysis = app.get(AnalysisService);

const worker =
  env.QUEUE_DRIVER === 'postgres'
    ? (() => {
        const w = new DbAnalysisWorker(app.get<PrismaClient>(PRISMA), analysis);
        w.start();
        return { close: () => w.stop() };
      })()
    : startAnalysisWorker(analysis, env.REDIS_URL);

const shutdown = async () => {
  await worker.close();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
