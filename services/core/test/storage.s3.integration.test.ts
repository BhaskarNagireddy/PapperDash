import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { S3ObjectStorage } from '../src/blocks/documents/storage.js';

// Runs against a real S3-compatible server: MinIO in CI (the "Integration tests (PostgreSQL + S3)" job).
const endpoint = process.env.S3_TEST_ENDPOINT;

describe.runIf(!!endpoint)('S3ObjectStorage against S3 (MinIO)', () => {
  const bucket = `pd-test-${randomBytes(4).toString('hex')}`;
  const region = 'eu-north-1';
  let storage: S3ObjectStorage;

  it('creates a test bucket', async () => {
    const s3 = new S3Client({ region, endpoint, forcePathStyle: true });
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    storage = new S3ObjectStorage({ bucket, region, endpoint });
  });

  it('accepts a direct browser/app upload through the presigned POST, then reads it back', async () => {
    const file = Buffer.from('%PDF-1.7 hello from the app');
    const target = await storage.createUpload('source/doc_1', { contentType: 'application/pdf', maxBytes: 1024, expiresInSec: 300 });
    const form = new FormData();
    for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
    form.append('file', new Blob([file], { type: 'application/pdf' }));
    const res = await fetch(target.url, { method: 'POST', body: form });
    expect([200, 201, 204]).toContain(res.status);

    expect(await storage.size('source/doc_1')).toBe(file.length);
    expect((await storage.get('source/doc_1')).equals(file)).toBe(true);
  });

  it('refuses uploads larger than the limit', async () => {
    const target = await storage.createUpload('source/too_big', { contentType: 'application/pdf', maxBytes: 10, expiresInSec: 300 });
    const form = new FormData();
    for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
    form.append('file', new Blob([Buffer.alloc(100, 1)], { type: 'application/pdf' }));
    const res = await fetch(target.url, { method: 'POST', body: form });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await storage.size('source/too_big')).toBeNull();
  });

  it('gives a short-lived download link for the station printer', async () => {
    await storage.put('print/doc_1.pdf', Buffer.from('printable'), 'application/pdf');
    const url = await storage.signedGetUrl('print/doc_1.pdf', 60);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('printable');
  });

  it('deletes files so retention really removes them', async () => {
    await storage.delete(['source/doc_1', 'print/doc_1.pdf']);
    expect(await storage.size('source/doc_1')).toBeNull();
    expect(await storage.size('print/doc_1.pdf')).toBeNull();
  });
});
