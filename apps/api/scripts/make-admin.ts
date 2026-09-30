/**
 * Grants (or revokes) the admin role. There is deliberately no API for this.
 *
 *   node scripts/make-admin.ts someone@example.com          # grant
 *   node scripts/make-admin.ts someone@example.com --revoke # revoke
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createPrismaClient } from '@speakai/db';

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error('usage: node scripts/make-admin.ts <email> [--revoke]');
  process.exit(1);
}

const env = { ...process.env, ...parseEnv(readFileSync(join(import.meta.dirname, '..', '.env'), 'utf8')) };
const prisma = createPrismaClient(env.DATABASE_URL ?? '');
const role = flag === '--revoke' ? 'user' : 'admin';

try {
  const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role } });
  console.log(`${user.email} is now ${user.role}`);
} catch {
  console.error(`No user with email ${email}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
