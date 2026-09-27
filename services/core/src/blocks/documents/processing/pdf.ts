import { PDFDocument } from 'pdf-lib';

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28; // ~10 mm, inside most printers' unprintable border

export type PdfInspection = { ok: true; pageCount: number } | { ok: false; reason: 'encrypted' | 'corrupt' | 'empty' };

export async function inspectPdf(buf: Buffer): Promise<PdfInspection> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (doc.isEncrypted) return { ok: false, reason: 'encrypted' };
  let pageCount: number;
  try {
    // pdf-lib parses damaged files leniently and only fails when the page tree is read.
    pageCount = doc.getPageCount();
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  return pageCount > 0 ? { ok: true, pageCount } : { ok: false, reason: 'empty' };
}

/** Places an image on one A4 page, rotated to landscape when wider than tall, scaled to fit inside the margins. */
export async function imageToPdf(buf: Buffer, type: 'png' | 'jpeg'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const image = type === 'png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
  const landscape = image.width > image.height;
  const page = doc.addPage(landscape ? [A4.h, A4.w] : [A4.w, A4.h]);
  const { width: pw, height: ph } = page.getSize();
  const scale = Math.min((pw - 2 * MARGIN) / image.width, (ph - 2 * MARGIN) / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  return Buffer.from(await doc.save());
}
