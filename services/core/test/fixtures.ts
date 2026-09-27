import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';

export async function pdfWithPages(n: number, { encrypted = false } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 780 });
  // Marks the file as encrypted the way a password-protected PDF's trailer does.
  if (encrypted) doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: PDFName.of('Standard') });
  return Buffer.from(await doc.save());
}

/** A valid solid-colour RGB PNG of the given size. */
export function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A real .docx made by LibreOffice, with an explicit page break before each page after the first. */
export function docxWithPages(n: number): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pd-fixture-'));
  const paras = Array.from({ length: n }, (_, i) => `<text:p${i ? ' text:style-name="PB"' : ''}>Page ${i + 1}</text:p>`).join('');
  writeFileSync(
    join(dir, 'in.fodt'),
    `<?xml version="1.0" encoding="UTF-8"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text"><office:automatic-styles><style:style style:name="PB" style:family="paragraph"><style:paragraph-properties fo:break-before="page"/></style:style></office:automatic-styles><office:body><office:text>${paras}</office:text></office:body></office:document>`,
  );
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${join(dir, 'profile')}`, '--convert-to', 'docx', '--outdir', dir, join(dir, 'in.fodt')], {
    stdio: 'ignore',
    timeout: 120_000,
  });
  return readFileSync(join(dir, 'in.docx'));
}

let officeAvailable: boolean | undefined;
/** True when LibreOffice with its Writer component is installed (CI installs it; the core-only package cannot convert). */
export function canConvertOffice(): boolean {
  if (officeAvailable === undefined) {
    try {
      officeAvailable = docxWithPages(1).length > 0;
    } catch {
      officeAvailable = false;
    }
  }
  return officeAvailable;
}
