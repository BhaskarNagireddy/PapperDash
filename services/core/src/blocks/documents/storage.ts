import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { UploadTarget } from '@papperdash/contracts';

/** Port: where document files live. Only the documents block holds file bytes. */
export abstract class ObjectStorage {
  /** A short-lived direct upload the client sends the file to, capped at `maxBytes`. */
  abstract createUpload(key: string, opts: { contentType: string; maxBytes: number; expiresInSec: number }): Promise<UploadTarget>;
  abstract size(key: string): Promise<number | null>;
  abstract get(key: string): Promise<Buffer>;
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract delete(keys: string[]): Promise<void>;
  /** A short-lived download link, e.g. for a station printer. */
  abstract signedGetUrl(key: string, expiresInSec: number): Promise<string>;
}

export interface S3Settings {
  bucket: string;
  region: string;
  /** Custom endpoint for MinIO in local development. */
  endpoint?: string;
  /** KMS key for server-side encryption at rest; absent in local development. */
  kmsKeyId?: string;
}

/** Amazon S3 (MinIO locally). Uploads go straight from the app to the bucket; files are encrypted at rest with KMS. */
export class S3ObjectStorage extends ObjectStorage {
  private readonly s3: S3Client;

  constructor(private readonly settings: S3Settings) {
    super();
    this.s3 = new S3Client({ region: settings.region, ...(settings.endpoint ? { endpoint: settings.endpoint, forcePathStyle: true } : {}) });
  }

  private get encryption(): Record<string, string> {
    return this.settings.kmsKeyId ? { 'x-amz-server-side-encryption': 'aws:kms', 'x-amz-server-side-encryption-aws-kms-key-id': this.settings.kmsKeyId } : {};
  }

  async createUpload(key: string, opts: { contentType: string; maxBytes: number; expiresInSec: number }): Promise<UploadTarget> {
    const fields = { 'Content-Type': opts.contentType, ...this.encryption };
    const post = await createPresignedPost(this.s3, {
      Bucket: this.settings.bucket,
      Key: key,
      Fields: fields,
      Conditions: [['content-length-range', 1, opts.maxBytes], ...Object.entries(fields).map(([k, v]) => ({ [k]: v }))],
      Expires: opts.expiresInSec,
    });
    return { url: post.url, fields: post.fields, expiresAt: new Date(Date.now() + opts.expiresInSec * 1000).toISOString(), maxBytes: opts.maxBytes };
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: key }));
      return head.ContentLength ?? null;
    } catch (err) {
      if ((err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(this.settings.kmsKeyId ? { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: this.settings.kmsKeyId } : {}),
      }),
    );
  }

  async delete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.s3.send(new DeleteObjectsCommand({ Bucket: this.settings.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
  }

  signedGetUrl(key: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }), { expiresIn: expiresInSec });
  }
}

/** In-memory storage for tests and for running core without S3/MinIO. Files vanish on restart. */
export class InMemoryObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async createUpload(key: string, opts: { contentType: string; maxBytes: number; expiresInSec: number }): Promise<UploadTarget> {
    return { url: 'memory://uploads', fields: { key, 'Content-Type': opts.contentType }, expiresAt: new Date(Date.now() + opts.expiresInSec * 1000).toISOString(), maxBytes: opts.maxBytes };
  }
  async size(key: string) {
    return this.objects.get(key)?.body.length ?? null;
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error(`No object ${key}`);
    return o.body;
  }
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async delete(keys: string[]) {
    for (const k of keys) this.objects.delete(k);
  }
  async signedGetUrl(key: string) {
    return `memory://${key}`;
  }
}
