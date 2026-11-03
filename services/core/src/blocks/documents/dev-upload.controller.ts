import { Body, Controller, HttpCode, NotFoundException, PayloadTooLargeException, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { CurrentUser as CurrentUserT } from '@papperdash/contracts';
import { CurrentUser, SessionGuard } from '../identity/index.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryObjectStorage, ObjectStorage } from './storage.js';

/** The largest file the development upload accepts; the price list's limit is checked when the upload is registered. */
const DEV_MAX_BYTES = 200 * 1024 * 1024;

/**
 * Stands in for S3's presigned POST when core runs without S3: in local development and in CI's full-stack
 * browser tests. With S3 configured (always in production: loadConfig refuses to start without it) every
 * request here is 404, and browsers upload straight to the bucket instead.
 *
 * It accepts a file only for the signed-in customer's own document that is still waiting for its upload,
 * so it cannot be used to overwrite or plant files.
 */
@Controller('documents/dev-upload')
@UseGuards(SessionGuard)
export class DevUploadController {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly documents: DocumentsService,
  ) {}

  @Post()
  @HttpCode(204)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DEV_MAX_BYTES, files: 1 } }))
  async upload(@CurrentUser() user: CurrentUserT, @Body() fields: Record<string, string>, @UploadedFile() file?: { buffer: Buffer; size: number }) {
    if (!(this.storage instanceof InMemoryObjectStorage)) throw new NotFoundException();
    const key = fields.key ?? '';
    const contentType = fields['Content-Type'] ?? '';
    if (!file) throw new NotFoundException();
    const target = await this.documents.awaitingUpload(user.id, key);
    if (!target || target.contentType !== contentType) throw new NotFoundException();
    if (file.size > target.maxBytes) throw new PayloadTooLargeException({ error: 'too_large', message: 'The file is larger than the upload limit.' });
    await this.storage.put(key, file.buffer, contentType);
  }
}
