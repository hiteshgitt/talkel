import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ProblemFilter } from './common/problem.js';
import { loadEnv } from './config/env.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const env = loadEnv();

const app = await NestFactory.create(AppModule.forRoot(env), { bodyParser: true });
app.setGlobalPrefix('v1');
app.useGlobalFilters(new ProblemFilter());
app.enableShutdownHooks();
await app.listen(env.PORT, '0.0.0.0');
new Logger('bootstrap').log(`API listening on :${env.PORT}`);
