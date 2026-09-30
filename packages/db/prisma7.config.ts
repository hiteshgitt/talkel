// Prisma ORM 7 CLI config (named prisma7.config.ts so it can't clash with Prisma 8's format).
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Local development: read packages/db/.env. CI/production pass DATABASE_URL directly.
if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
