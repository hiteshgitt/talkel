import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { startAnalysisWorker } from './analysis/analysis-worker.js';
import { AnalysisService } from './analysis/analysis.service.js';
import { DbAnalysisWorker } from './analysis/db-analysis-worker.js';
import { PRISMA } from './db/prisma.module.js';
import type { PrismaClient } from '@speakai/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import express, { type Request, type Response } from 'express';
import { AppModule } from './app.module.js';
import { AUTH_BASE_PATH, type Auth, CLIENT_IP_HEADER } from './auth/auth.js';
import { AUTH } from './auth/session.guard.js';
import { ProblemFilter } from './common/problem.js';
import { loadEnv, withDotEnv } from './config/env.js';

// DOTENV_PATH lets tests point at a nonexistent file so a developer's real .env is never used.
const dotEnvPath = process.env.DOTENV_PATH ?? join(import.meta.dirname, '..', '.env');
const env = loadEnv(withDotEnv(process.env, dotEnvPath));

// Body parsing is added manually below: Better Auth must see the raw request stream.
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), { bodyParser: false });
app.set('trust proxy', 'loopback'); // correct client IPs (rate limits) behind the Next.js / local proxies

app.enableCors({ origin: [env.WEB_BASE_URL], credentials: true });

const auth = app.get<Auth>(AUTH);
const authHandler = toNodeHandler(auth);
app.getHttpAdapter().getInstance().all(`${AUTH_BASE_PATH}/*splat`, (req: Request, res: Response) => {
  // Better Auth rate-limits per client IP. Overwrite (never trust) any client-sent value with the
  // socket address, or the forwarded address when the request came through our local proxy.
  const forwarded = env.TRUST_CLIENT_IP_HEADER ? req.headers['x-talkel-client-ip'] : undefined;
  req.headers[CLIENT_IP_HEADER] = (typeof forwarded === 'string' && forwarded) || req.ip || req.socket.remoteAddress || 'unknown';
  return authHandler(req, res);
});
app.use(express.json({ limit: '100kb' }));

app.setGlobalPrefix('v1');
app.useGlobalFilters(new ProblemFilter());
app.enableShutdownHooks();
// One always-on service (Cloud Run): run the after-call analysis worker in this process too.
if (env.RUN_WORKER_IN_API) {
  if (env.QUEUE_DRIVER === 'postgres') {
    const worker = new DbAnalysisWorker(app.get<PrismaClient>(PRISMA), app.get(AnalysisService));
    worker.start();
    process.on('SIGTERM', () => void worker.stop());
  } else {
    const worker = startAnalysisWorker(app.get(AnalysisService), env.REDIS_URL);
    process.on('SIGTERM', () => void worker.close());
  }
}

await app.listen(env.PORT, '0.0.0.0');
new Logger('bootstrap').log(`API listening on :${env.PORT}`);
