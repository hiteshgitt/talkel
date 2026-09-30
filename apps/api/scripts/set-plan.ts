/**
 * Sets an account's plan until payments exist (Milestone 4+).
 *
 *   node scripts/set-plan.ts someone@example.com PRO
 *   node scripts/set-plan.ts someone@example.com FREE
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createPrismaClient } from '@speakai/db';

const [email, plan] = process.argv.slice(2);
if (!email || (plan !== 'PRO' && plan !== 'FREE')) {
  console.error('usage: node scripts/set-plan.ts <email> PRO|FREE');
  process.exit(1);
}
const env = { ...process.env, ...parseEnv(readFileSync(join(import.meta.dirname, '..', '.env'), 'utf8')) };
const prisma = createPrismaClient(env.DATABASE_URL ?? '');
try {
  const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { plan } });
  console.log(`${user.email} is now on the ${user.plan} plan`);
} catch {
  console.error(`No user with email ${email}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
