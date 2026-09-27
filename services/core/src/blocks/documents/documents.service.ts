import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ACCEPTED_FILE_TYPES,
  REJECTION_REASONS,
  type CreateUploadInput,
  type CurrentUser,
  type DocumentEvent,
  type DocumentStatus,
  type DocumentView,
  type AcceptedContentType,
  type OrderCreated,
  type OrderState,
  type OrderStateChanged,
  type RejectionReason,
  type UploadTarget,
} from '@papperdash/contracts';
import { and, desc, eq, isNotNull, lte, ne } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { DB, type Db, type DbOrTx } from '../../platform/database.js';
import { EventBus, Outbox } from '../../platform/events.js';
import { newId } from '../../platform/ids.js';
import { PricingService } from '../pricing/index.js';
import { documentOrders, documents } from './documents.schema.js';
import { DocumentProcessor, MalwareScanner } from './processing/processor.js';
import { retainUntil } from './retention.js';
import { ObjectStorage } from './storage.js';

type Row = typeof documents.$inferSelect;

const UPLOAD_URL_TTL_SEC = 15 * 60;
const PRINT_URL_TTL_SEC = 5 * 60;

@Injectable()
export class DocumentsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DocumentsService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly outbox: Outbox,
    private readonly bus: EventBus,
    private readonly storage: ObjectStorage,
    private readonly processor: DocumentProcessor,
    private readonly scanner: MalwareScanner,
    private readonly pricing: PricingService,
  ) {}

  onModuleInit() {
    this.bus.subscribe<DocumentEvent>('documents.DocumentUploaded', 'documents.process', (e, tx) => this.process(e.payload.documentId, tx));
    this.bus.subscribe<OrderCreated>('orders.OrderCreated', 'documents.link-order', (e, tx) =>
      this.trackOrder(tx, e.payload.documentId, e.payload.orderId, 'Draft', new Date(e.occurredAt)),
    );
    this.bus.subscribe<OrderStateChanged>('orders.OrderStateChanged', 'documents.order-state', (e, tx) =>
      this.trackOrder(tx, null, e.payload.orderId, e.payload.to, new Date(e.occurredAt)),
    );
    if (this.config.retentionSweepMs > 0) this.sweepTimer = setInterval(() => void this.sweep().catch((err) => this.log.error('Retention sweep failed', err)), this.config.retentionSweepMs);
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ---------- Customer: upload ----------

  /** Step 1: register the file and get a direct upload to encrypted storage. */
  async createUpload(user: CurrentUser, input: CreateUploadInput): Promise<{ document: DocumentView; upload: UploadTarget }> {
    const { maxFileMb } = await this.pricing.active('SE');
    const maxBytes = maxFileMb * 1024 * 1024;
    if (input.sizeBytes > maxBytes) {
      throw new HttpException({ error: 'too_large', message: `Files can be up to ${maxFileMb} MB. Compress the file or split it, then try again.`, maxFileMb }, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const ext = input.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!(ACCEPTED_FILE_TYPES[input.contentType].ext as readonly string[]).includes(ext)) {
      throw new HttpException({ error: 'type_mismatch', message: REJECTION_REASONS.type_mismatch }, HttpStatus.BAD_REQUEST);
    }
    const now = this.clock.now();
    const id = newId('doc');
    const row: Row = {
      id,
      ownerId: user.id,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      status: 'awaiting_upload',
      sourceKey: `source/${id}`,
      printKey: null,
      pageCount: null,
      rejectionReason: null,
      retainUntil: retainUntil(now, []),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.db.insert(documents).values(row);
    const upload = await this.storage.createUpload(row.sourceKey, { contentType: input.contentType, maxBytes, expiresInSec: UPLOAD_URL_TTL_SEC });
    return { document: toView(row), upload };
  }

  /** Step 2: the client says the upload finished; processing starts in the background. */
  async completeUpload(user: CurrentUser, documentId: string): Promise<DocumentView> {
    const doc = await this.ownedBy(user.id, documentId);
    if (doc.status !== 'awaiting_upload') return toView(doc); // idempotent: a retried "complete" is harmless
    const size = await this.storage.size(doc.sourceKey);
    if (size == null) throw new ConflictException({ error: 'upload_missing', message: 'The upload did not finish. Check your connection and upload the file again.' });
    const now = this.clock.now();
    const [updated] = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(documents)
        .set({ status: 'processing', sizeBytes: size, updatedAt: now })
        .where(and(eq(documents.id, doc.id), eq(documents.status, 'awaiting_upload')))
        .returning();
      if (rows.length) await this.outbox.append<DocumentEvent>(tx, { type: 'documents.DocumentUploaded', version: 1, aggregateId: doc.id, payload: { documentId: doc.id, ownerId: doc.ownerId } });
      return rows;
    });
    return toView(updated ?? doc);
  }

  async get(user: CurrentUser, documentId: string): Promise<DocumentView> {
    return toView(await this.ownedBy(user.id, documentId));
  }

  async list(user: CurrentUser): Promise<DocumentView[]> {
    const rows = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.ownerId, user.id), ne(documents.status, 'deleted')))
      .orderBy(desc(documents.createdAt))
      .limit(50);
    return rows.map(toView);
  }

  /** Customers may delete a file at any time, except while a paid order is still printing or delivering it. */
  async deleteByCustomer(user: CurrentUser, documentId: string): Promise<void> {
    const doc = await this.ownedBy(user.id, documentId);
    if (doc.status === 'deleted') return;
    const links = await this.links(this.db, doc.id);
    if (retainUntil(doc.createdAt, links) === null) {
      throw new ConflictException({ error: 'in_use', message: 'This file is needed for an order in progress. It is deleted automatically 24 hours after the order is finished.' });
    }
    await this.destroy(doc, 'customer');
  }

  // ---------- Other blocks (public API) ----------

  /** Used by orders: the document must belong to the customer and be ready to print. Returns its page count. */
  async getPrintable(ownerId: string, documentId: string): Promise<{ pageCount: number }> {
    const [doc] = await this.db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)));
    if (!doc || doc.status === 'deleted') throw new NotFoundException({ error: 'document_not_found', message: 'That file is no longer available. Upload it again.' });
    if (doc.status !== 'ready') {
      const message = doc.status === 'rejected' ? REJECTION_REASONS[doc.rejectionReason as RejectionReason] : 'The file is still being prepared. Try again in a moment.';
      throw new ConflictException({ error: 'document_not_ready', message });
    }
    return { pageCount: doc.pageCount! };
  }

  /** Used by fulfilment/stations: a 5-minute link to the printable PDF. Never shown to customers or couriers. */
  async printUrl(documentId: string): Promise<string> {
    const [doc] = await this.db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc?.printKey || doc.status !== 'ready') throw new NotFoundException();
    return this.storage.signedGetUrl(doc.printKey, PRINT_URL_TTL_SEC);
  }

  // ---------- Background ----------

  /** Validates, converts and counts pages. Runs once per upload (event consumer). */
  async process(documentId: string, tx: DbOrTx): Promise<void> {
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
    if (!doc || doc.status !== 'processing') return;
    const bytes = await this.storage.get(doc.sourceKey);
    const result = (await this.scanner.isClean(bytes)) ? await this.processor.process(bytes, doc.contentType as AcceptedContentType) : ({ ok: false, reason: 'malware' } as const);
    const now = this.clock.now();

    if (!result.ok) {
      await tx.update(documents).set({ status: 'rejected', rejectionReason: result.reason, updatedAt: now }).where(eq(documents.id, doc.id));
      await this.outbox.append<DocumentEvent>(tx, { type: 'documents.DocumentRejected', version: 1, aggregateId: doc.id, payload: { documentId: doc.id, ownerId: doc.ownerId, reason: result.reason } });
      return;
    }
    let printKey = doc.sourceKey;
    if (result.converted) {
      printKey = `print/${doc.id}.pdf`;
      await this.storage.put(printKey, result.pdf, 'application/pdf');
    }
    await tx.update(documents).set({ status: 'ready', printKey, pageCount: result.pageCount, updatedAt: now }).where(eq(documents.id, doc.id));
    await this.outbox.append<DocumentEvent>(tx, {
      type: 'documents.DocumentReady',
      version: 1,
      aggregateId: doc.id,
      payload: { documentId: doc.id, ownerId: doc.ownerId, pageCount: result.pageCount },
    });
  }

  /** Deletes every file whose retention period has passed. Safe to run on several instances at once. */
  async sweep(): Promise<number> {
    const due = await this.db
      .select()
      .from(documents)
      .where(and(ne(documents.status, 'deleted'), isNotNull(documents.retainUntil), lte(documents.retainUntil, this.clock.now())))
      .limit(500);
    for (const doc of due) await this.destroy(doc, 'retention');
    return due.length;
  }

  private async trackOrder(tx: DbOrTx, documentId: string | null, orderId: string, state: OrderState, at: Date): Promise<void> {
    if (documentId) {
      await tx.insert(documentOrders).values({ documentId, orderId, orderState: state, changedAt: at }).onConflictDoNothing();
    } else {
      const [link] = await tx.select().from(documentOrders).where(eq(documentOrders.orderId, orderId));
      if (!link) return;
      documentId = link.documentId;
      await tx.update(documentOrders).set({ orderState: state, changedAt: at }).where(and(eq(documentOrders.documentId, documentId), eq(documentOrders.orderId, orderId)));
    }
    const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
    if (!doc || doc.status === 'deleted') return;
    await tx.update(documents).set({ retainUntil: retainUntil(doc.createdAt, await this.links(tx, documentId)) }).where(eq(documents.id, documentId));
  }

  private async destroy(doc: Row, trigger: 'retention' | 'customer'): Promise<void> {
    await this.storage.delete([...new Set([doc.sourceKey, doc.printKey].filter((k): k is string => !!k))]);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(documents)
        // The file name can be personal data; only the ID and page count are kept for order records.
        .set({ status: 'deleted', fileName: '(deleted)', printKey: null, retainUntil: null, deletedAt: now, updatedAt: now })
        .where(and(eq(documents.id, doc.id), ne(documents.status, 'deleted')))
        .returning({ id: documents.id });
      if (rows.length) await this.outbox.append<DocumentEvent>(tx, { type: 'documents.DocumentDeleted', version: 1, aggregateId: doc.id, payload: { documentId: doc.id, ownerId: doc.ownerId, trigger } });
    });
  }

  private async links(tx: DbOrTx, documentId: string) {
    const rows = await tx.select().from(documentOrders).where(eq(documentOrders.documentId, documentId));
    return rows.map((r) => ({ state: r.orderState as OrderState, changedAt: r.changedAt }));
  }

  private async ownedBy(ownerId: string, documentId: string): Promise<Row> {
    const [doc] = await this.db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)));
    if (!doc) throw new NotFoundException();
    return doc;
  }
}

function toView(r: Row): DocumentView {
  const reason = r.rejectionReason as RejectionReason | null;
  return {
    id: r.id,
    fileName: r.fileName,
    contentType: r.contentType as AcceptedContentType,
    sizeBytes: r.sizeBytes,
    status: r.status as DocumentStatus,
    pageCount: r.pageCount,
    rejection: reason ? { reason, message: REJECTION_REASONS[reason] } : null,
    deleteAfter: r.retainUntil?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
