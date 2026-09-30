import { createReadStream, createWriteStream, type ReadStream, type WriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Where call recordings live. Local disk in development; an S3-compatible store (Cloudflare R2)
 * implements the same interface for production.
 */
export interface RecordingStore {
  openWrite(key: string): Promise<WriteStream>;
  size(key: string): Promise<number | null>;
  openRead(key: string, range?: { start: number; end: number }): ReadStream;
  remove(key: string): Promise<void>;
}

export const RECORDING_STORE = Symbol('RECORDING_STORE');

/** Keys look like "<userId>/<conversationId>.ogg"; anything else is rejected (no path traversal). */
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.ogg$/;

export function recordingKey(userId: string, conversationId: string): string {
  const key = `${userId}/${conversationId}.ogg`;
  if (!KEY.test(key)) throw new Error('invalid recording key');
  return key;
}

export class LocalRecordingStore implements RecordingStore {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  async openWrite(key: string): Promise<WriteStream> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    return createWriteStream(path, { mode: 0o600 });
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  openRead(key: string, range?: { start: number; end: number }): ReadStream {
    return createReadStream(this.path(key), range);
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  private path(key: string): string {
    if (!KEY.test(key)) throw new Error('invalid recording key');
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('invalid recording key');
    return full;
  }
}
