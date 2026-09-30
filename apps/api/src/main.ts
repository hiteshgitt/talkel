import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
  req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  return authHandler(req, res);
});
app.use(express.json({ limit: '100kb' }));

app.setGlobalPrefix('v1');
app.useGlobalFilters(new ProblemFilter());
app.enableShutdownHooks();
await app.listen(env.PORT, '0.0.0.0');
new Logger('bootstrap').log(`API listening on :${env.PORT}`);
