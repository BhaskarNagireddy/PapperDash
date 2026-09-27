import type { FileKind } from '@papperdash/contracts';

export type SniffedType = 'pdf' | 'png' | 'jpeg' | 'docx' | 'xlsx' | 'pptx';

/** Identifies a file by its content (magic bytes), never by its name or declared type. */
export function sniff(buf: Buffer): SniffedType | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    // OOXML files are ZIP archives; the part names say which application made them.
    const names = buf.toString('latin1');
    if (names.includes('word/')) return 'docx';
    if (names.includes('xl/')) return 'xlsx';
    if (names.includes('ppt/')) return 'pptx';
  }
  return null;
}

const KIND: Record<SniffedType, FileKind> = { pdf: 'pdf', png: 'image', jpeg: 'image', docx: 'office', xlsx: 'office', pptx: 'office' };
export const kindOf = (t: SniffedType): FileKind => KIND[t];

/** The declared content type for each sniffed type. */
export const CONTENT_TYPE: Record<SniffedType, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
