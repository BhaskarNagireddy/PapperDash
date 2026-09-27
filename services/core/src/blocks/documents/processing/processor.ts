import { ACCEPTED_FILE_TYPES, MAX_DOCUMENT_PAGES, type AcceptedContentType, type RejectionReason } from '@papperdash/contracts';
import { kindOf, sniff } from './file-type.js';
import { officeToPdf } from './office.js';
import { imageToPdf, inspectPdf } from './pdf.js';

export type ProcessResult = { ok: true; pdf: Buffer; pageCount: number; converted: boolean } | { ok: false; reason: RejectionReason };

/** Port: turns an uploaded file into a printable PDF and counts its pages. */
export abstract class DocumentProcessor {
  abstract process(file: Buffer, declared: AcceptedContentType): Promise<ProcessResult>;
}

/** Port: malware scanning. The ClamAV adapter replaces the pass-through before production (see open questions). */
export abstract class MalwareScanner {
  abstract isClean(file: Buffer): Promise<boolean>;
}

export class PassThroughScanner extends MalwareScanner {
  async isClean() {
    return true;
  }
}

/** Runs in the core process today; moves into the sandboxed doc-worker container unchanged when load requires. */
export class LocalDocumentProcessor extends DocumentProcessor {
  constructor(private readonly convertOffice: typeof officeToPdf = officeToPdf) {
    super();
  }

  async process(file: Buffer, declared: AcceptedContentType): Promise<ProcessResult> {
    if (!file.length) return { ok: false, reason: 'empty' };
    const actual = sniff(file);
    if (!actual) return { ok: false, reason: 'unsupported_type' };
    // The content must be the kind of file the customer said it was (a .pdf that is really a .docx is refused).
    if (kindOf(actual) !== ACCEPTED_FILE_TYPES[declared].kind || (kindOf(actual) === 'office' && !ACCEPTED_FILE_TYPES[declared].ext.includes(actual as never))) {
      return { ok: false, reason: 'type_mismatch' };
    }

    let pdf: Buffer;
    let converted = true;
    try {
      if (actual === 'pdf') {
        pdf = file;
        converted = false;
      } else if (actual === 'png' || actual === 'jpeg') {
        pdf = await imageToPdf(file, actual);
      } else {
        pdf = await this.convertOffice(file, actual);
      }
    } catch {
      return { ok: false, reason: actual === 'pdf' || actual === 'png' || actual === 'jpeg' ? 'corrupt' : 'conversion_failed' };
    }

    const inspected = await inspectPdf(pdf);
    if (!inspected.ok) return { ok: false, reason: inspected.reason };
    if (inspected.pageCount > MAX_DOCUMENT_PAGES) return { ok: false, reason: 'too_many_pages' };
    return { ok: true, pdf, pageCount: inspected.pageCount, converted };
  }
}
