import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { TEST_DATABASE_URL } from './support/api-process.js';

/** Brings the test database to the latest migration and empties it before the e2e run. */
export default async function setup(): Promise<void> {
  const dbPackage = join(import.meta.dirname, '..', '..', '..', 'packages', 'db');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length > 0) {
      await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
    }
  } finally {
    await client.end();
  }

  // Scenario and persona content, as in development.
  execFileSync('pnpm', ['seed'], { cwd: dbPackage, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: 'pipe' });
}
