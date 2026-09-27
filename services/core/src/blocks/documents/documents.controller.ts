import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CreateUploadInput, type CurrentUser as CurrentUserT } from '@papperdash/contracts';
import { ZodPipe } from '../../platform/validation.js';
import { CurrentUser, SessionGuard } from '../identity/index.js';
import { DocumentsService } from './documents.service.js';

/** Upload flow: POST /documents → send the file to `upload.url` → POST /documents/:id/complete → poll until ready. */
@Controller('documents')
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  createUpload(@CurrentUser() user: CurrentUserT, @Body(new ZodPipe(CreateUploadInput)) body: CreateUploadInput) {
    return this.documents.createUpload(user, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: CurrentUserT, @Param('id') id: string) {
    return this.documents.completeUpload(user, id);
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserT) {
    return { documents: await this.documents.list(user) };
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserT, @Param('id') id: string) {
    return this.documents.get(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserT, @Param('id') id: string) {
    await this.documents.deleteByCustomer(user, id);
  }
}
