import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { IdentityModule } from '../identity/index.js';
import { PricingModule } from '../pricing/index.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocumentProcessor, LocalDocumentProcessor, MalwareScanner, PassThroughScanner } from './processing/processor.js';
import { InMemoryObjectStorage, ObjectStorage, S3ObjectStorage } from './storage.js';

@Module({
  imports: [IdentityModule, PricingModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: ObjectStorage,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => (c.storage ? new S3ObjectStorage(c.storage) : new InMemoryObjectStorage()),
    },
    { provide: DocumentProcessor, useFactory: () => new LocalDocumentProcessor() },
    { provide: MalwareScanner, useFactory: () => new PassThroughScanner() },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
