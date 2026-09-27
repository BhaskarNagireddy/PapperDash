import { z } from 'zod';
import type { DomainEvent } from './events.js';

/** File types customers may upload. Office files are converted to PDF on the server before pricing. */
export const ACCEPTED_FILE_TYPES = {
  'application/pdf': { ext: ['pdf'], kind: 'pdf' },
  'image/jpeg': { ext: ['jpg', 'jpeg'], kind: 'image' },
  'image/png': { ext: ['png'], kind: 'image' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: ['docx'], kind: 'office' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: ['xlsx'], kind: 'office' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: ['pptx'], kind: 'office' },
} as const;
export type AcceptedContentType = keyof typeof ACCEPTED_FILE_TYPES;
export type FileKind = (typeof ACCEPTED_FILE_TYPES)[AcceptedContentType]['kind'];

export const DOCUMENT_STATUSES = ['awaiting_upload', 'processing', 'ready', 'rejected', 'deleted'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Why a document could not be used, with a customer-facing explanation per code. */
export const REJECTION_REASONS = {
  unsupported_type: 'This file type is not supported. Upload a PDF, JPG, PNG, Word, Excel or PowerPoint file.',
  type_mismatch: 'The file content does not match its name. Export it again as PDF and upload that.',
  too_large: 'The file is larger than the upload limit.',
  empty: 'The file is empty.',
  encrypted: 'The PDF is password protected. Remove the password and upload it again.',
  corrupt: 'The file could not be read. Export it again as PDF and upload that.',
  conversion_failed: 'The file could not be converted for printing. Export it as PDF and upload that.',
  too_many_pages: 'The document has too many pages to process.',
  malware: 'The file was blocked by our security scan.',
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;

/** Hard ceiling on document length we process at all; the per-order print limit is in the price list. */
export const MAX_DOCUMENT_PAGES = 1000;

/** Unpaid uploads are deleted this long after upload. */
export const UNPAID_RETENTION_HOURS = 2;
/** Files are deleted this long after the order is fulfilled, refunded or cancelled after payment. */
export const FULFILLED_RETENTION_HOURS = 24;

export const CreateUploadInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(Object.keys(ACCEPTED_FILE_TYPES) as [AcceptedContentType, ...AcceptedContentType[]], {
    message: REJECTION_REASONS.unsupported_type,
  }),
  sizeBytes: z.int().min(1),
});
export type CreateUploadInput = z.infer<typeof CreateUploadInput>;

/** A direct browser/app upload to encrypted storage (an S3 presigned POST): send `fields` plus the file as form data to `url`. */
export interface UploadTarget {
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
}

export interface DocumentView {
  id: string;
  fileName: string;
  contentType: AcceptedContentType;
  sizeBytes: number;
  status: DocumentStatus;
  /** Pages of the printable PDF, once processed. */
  pageCount: number | null;
  rejection: { reason: RejectionReason; message: string } | null;
  /** When the file will be deleted, if a deletion is scheduled. Shown to customers (privacy requirement). */
  deleteAfter: string | null;
  createdAt: string;
}

// ---------- Page ranges ----------

/** Pages selected by a range like "1-3,5" in a document of `pageCount` pages; all pages when no range is given. */
export function selectedPages(pageRange: string | undefined, pageCount: number): { pages: number[] } | { error: string } {
  if (!pageRange?.trim()) return { pages: Array.from({ length: pageCount }, (_, i) => i + 1) };
  const set = new Set<number>();
  for (const part of pageRange.split(',')) {
    const [a, b] = part.split('-').map((s) => Number(s.trim()));
    const from = a!;
    const to = b ?? from;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return { error: `"${part.trim()}" is not a valid page range.` };
    if (to > pageCount) return { error: `The document has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}; page ${to} does not exist.` };
    for (let p = from; p <= to; p++) set.add(p);
  }
  return { pages: [...set].sort((x, y) => x - y) };
}

export type DocumentUploaded = DomainEvent<'documents.DocumentUploaded', { documentId: string; ownerId: string }>;
export type DocumentReady = DomainEvent<'documents.DocumentReady', { documentId: string; ownerId: string; pageCount: number }>;
export type DocumentRejected = DomainEvent<'documents.DocumentRejected', { documentId: string; ownerId: string; reason: RejectionReason }>;
export type DocumentDeleted = DomainEvent<'documents.DocumentDeleted', { documentId: string; ownerId: string; trigger: 'retention' | 'customer' }>;
export type DocumentEvent = DocumentUploaded | DocumentReady | DocumentRejected | DocumentDeleted;
