import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './common/problem.js';
import { loadEnv, withDotEnv } from './config/env.js';

// DOTENV_PATH lets tests point at a nonexistent file so a developer's real .env is never used.
const dotEnvPath = process.env.DOTENV_PATH ?? join(import.meta.dirname, '..', '.env');
const env = loadEnv(withDotEnv(process.env, dotEnvPath));

const app = await NestFactory.create(AppModule.forRoot(env), { bodyParser: true });
app.setGlobalPrefix('v1');
app.useGlobalFilters(new ProblemFilter());
app.enableShutdownHooks();
await app.listen(env.PORT, '0.0.0.0');
new Logger('bootstrap').log(`API listening on :${env.PORT}`);
