import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PrismaClient } from '@speakai/db';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import type { RecordingStore } from '../recording/recording-store.js';

const LIVE = ['CONNECTING', 'ACTIVE', 'RECONNECTING'] as const;

/**
 * Runs before an account is deleted. Database rows go with the user (every table cascades from
 * users); this removes what lives outside the database: call recordings and call logs.
 */
export async function purgeUserFiles(
  prisma: PrismaClient,
  files: { recordings: RecordingStore; callLogDir: string },
  userId: string,
): Promise<void> {
  if (!z.string().uuid().safeParse(userId).success) throw new Error('invalid user id');
  const live = await prisma.conversationSession.count({ where: { userId, status: { in: [...LIVE] } } });
  if (live > 0) throw new APIError('BAD_REQUEST', { message: 'Please end your call before deleting your account.' });

  const sessions = await prisma.conversationSession.findMany({ where: { userId }, select: { id: true } });
  await Promise.all(sessions.map((s) => rm(join(resolve(files.callLogDir), `${s.id}.jsonl`), { force: true })));
  // Recording keys are "<userId>/<conversationId>.ogg": one prefix (disk folder or R2) per user.
  await files.recordings.removeUser(userId);
}
