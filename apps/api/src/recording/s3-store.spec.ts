import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { S3RecordingStore } from './recording-store.js';

/**
 * Runs against a real S3-compatible server when TEST_S3_ENDPOINT is set (e.g. a local MinIO):
 *   TEST_S3_ENDPOINT=http://127.0.0.1:9010 TEST_S3_KEY=minio TEST_S3_SECRET=minio-secret TEST_S3_BUCKET=test npx vitest run s3-store
 */
const endpoint = process.env.TEST_S3_ENDPOINT;
describe.runIf(Boolean(endpoint))('S3RecordingStore (R2-compatible)', () => {
  const store = new S3RecordingStore({
    endpoint: endpoint!,
    region: 'us-east-1',
    bucket: process.env.TEST_S3_BUCKET ?? 'test',
    accessKeyId: process.env.TEST_S3_KEY ?? '',
    secretAccessKey: process.env.TEST_S3_SECRET ?? '',
  });

  it('streams a recording up, reports its size, serves byte ranges, and deletes per user', async () => {
    const user = randomUUID();
    const key = `${user}/${randomUUID()}.ogg`;
    const data = Buffer.alloc(6 * 1024 * 1024 + 123); // > one 5 MB part: exercises multipart
    for (let i = 0; i < data.length; i++) data[i] = i % 251;

    const out = await store.openWrite(key);
    await new Promise<void>((resolve, reject) => {
      out.once('error', reject);
      for (let i = 0; i < data.length; i += 64 * 1024) out.write(data.subarray(i, i + 64 * 1024));
      out.end((err?: Error | null) => (err ? reject(err) : resolve())); // only once the object is stored
    });
    expect(await store.size(key)).toBe(data.length);

    const read = async (range?: { start: number; end: number }) => {
      const chunks: Buffer[] = [];
      for await (const c of store.openRead(key, range)) chunks.push(c as Buffer);
      return Buffer.concat(chunks);
    };
    expect((await read({ start: 100, end: 199 })).equals(data.subarray(100, 200))).toBe(true);
    expect((await read()).equals(data)).toBe(true);

    await store.removeUser(user);
    expect(await store.size(key)).toBeNull();
  }, 60_000);

  it('rejects keys that are not "<user>/<conversation>.ogg"', async () => {
    await expect(store.openWrite('../etc/passwd')).rejects.toThrow('invalid recording key');
  });
});
