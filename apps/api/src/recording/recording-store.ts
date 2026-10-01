import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { PassThrough, type Readable, Writable } from 'node:stream';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

/**
 * Where call recordings live. Local disk in development; an S3-compatible store (Cloudflare R2)
 * implements the same interface for production.
 */
export interface RecordingStore {
  /** The stream emits 'finish' only once the recording is fully stored. */
  openWrite(key: string): Promise<Writable>;
  size(key: string): Promise<number | null>;
  openRead(key: string, range?: { start: number; end: number }): Readable;
  remove(key: string): Promise<void>;
  /** Account deletion: every recording of this user. */
  removeUser(userId: string): Promise<void>;
}

export const RECORDING_STORE = Symbol('RECORDING_STORE');

/** Keys look like "<userId>/<conversationId>.ogg"; anything else is rejected (no path traversal). */
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.ogg$/;
const USER = /^[0-9a-f-]{36}$/;

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

  async openWrite(key: string): Promise<Writable> {
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

  openRead(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.path(key), range);
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async removeUser(userId: string): Promise<void> {
    if (!USER.test(userId)) throw new Error('invalid user id');
    await rm(join(this.root, userId), { recursive: true, force: true });
  }

  private path(key: string): string {
    if (!KEY.test(key)) throw new Error('invalid recording key');
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('invalid recording key');
    return full;
  }
}

export interface S3StoreOptions {
  /** e.g. https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Production store: any S3-compatible service (Supabase Storage, Cloudflare R2). The bucket stays private; recordings are only
 * ever streamed through our API after an ownership check.
 */
export class S3RecordingStore implements RecordingStore {
  private readonly s3: S3Client;

  constructor(private readonly opts: S3StoreOptions) {
    this.s3 = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region ?? 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      // R2 (and other S3-compatibles) don't support the SDK's newer default checksums on multipart uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async openWrite(key: string): Promise<Writable> {
    check(key);
    const body = new PassThrough();
    const upload = new Upload({
      client: this.s3,
      params: { Bucket: this.opts.bucket, Key: key, Body: body, ContentType: 'audio/ogg' },
      queueSize: 2,
      partSize: 5 * 1024 * 1024,
    });
    const done = upload.done();
    done.catch(() => undefined); // surfaced through the stream below
    // 'finish' fires only after R2 has the whole object.
    return new Writable({
      write(chunk, _enc, cb) {
        body.write(chunk) ? cb() : body.once('drain', () => cb());
      },
      final(cb) {
        body.end();
        done.then(() => cb(), (err: Error) => cb(err));
      },
      destroy(err, cb) {
        body.destroy(err ?? undefined);
        cb(err);
      },
    });
  }

  async size(key: string): Promise<number | null> {
    check(key);
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  openRead(key: string, range?: { start: number; end: number }): Readable {
    check(key);
    const out = new PassThrough();
    this.s3
      .send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key, ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}) }))
      .then((res) => (res.Body as Readable).on('error', (e) => out.destroy(e)).pipe(out))
      .catch((err: Error) => out.destroy(err));
    return out;
  }

  async remove(key: string): Promise<void> {
    check(key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async removeUser(userId: string): Promise<void> {
    if (!USER.test(userId)) throw new Error('invalid user id');
    for (;;) {
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.opts.bucket, Prefix: `${userId}/` }));
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length === 0) return;
      await this.s3.send(new DeleteObjectsCommand({ Bucket: this.opts.bucket, Delete: { Objects: keys } }));
      if (!page.IsTruncated) return;
    }
  }
}

function check(key: string): void {
  if (!KEY.test(key)) throw new Error('invalid recording key');
}

/** S3-compatible storage when configured (production: Supabase Storage or R2); local disk otherwise. */
export function createRecordingStore(env: {
  RECORDINGS_DIR: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ENDPOINT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
}): RecordingStore {
  if (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return new S3RecordingStore({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }
  const r2 = env.R2_ENDPOINT ?? (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  if (r2 && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return new S3RecordingStore({ endpoint: r2, bucket: env.R2_BUCKET, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY });
  }
  return new LocalRecordingStore(env.RECORDINGS_DIR);
}
