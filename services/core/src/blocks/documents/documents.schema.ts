import { index, integer, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const documentsSchema = pgSchema('documents');

export const documents = documentsSchema.table(
  'documents',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: text('status').notNull(),
    /** The file as uploaded. */
    sourceKey: text('source_key').notNull(),
    /** The printable PDF (the source itself for PDF uploads). */
    printKey: text('print_key'),
    pageCount: integer('page_count'),
    rejectionReason: text('rejection_reason'),
    /** When the retention sweep deletes the files; null while an order in progress needs them. */
    retainUntil: timestamp('retain_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('documents_owner_idx').on(t.ownerId, t.createdAt), index('documents_retention_idx').on(t.retainUntil)],
);

/** Which orders use a document and their latest state, learned from order events. Drives retention. */
export const documentOrders = documentsSchema.table(
  'document_orders',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id),
    orderId: text('order_id').notNull(),
    orderState: text('order_state').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.orderId] }), index('document_orders_order_idx').on(t.orderId)],
);
