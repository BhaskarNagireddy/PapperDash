// Public API of the documents block. Other blocks import only from here.
export { DocumentsModule } from './documents.module.js';
export { DocumentsService } from './documents.service.js';
export { ObjectStorage, InMemoryObjectStorage } from './storage.js';
export { DocumentProcessor, LocalDocumentProcessor, MalwareScanner } from './processing/processor.js';
