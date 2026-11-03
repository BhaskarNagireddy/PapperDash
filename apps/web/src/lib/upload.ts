import { ACCEPTED_FILE_TYPES, type AcceptedContentType, type DocumentView, type UploadTarget } from '@papperdash/contracts';
import { api, ApiError } from './api';

/** What the file picker accepts: every type core processes, by MIME type and extension. */
export const ACCEPT = [...Object.keys(ACCEPTED_FILE_TYPES), ...Object.values(ACCEPTED_FILE_TYPES).flatMap((t) => t.ext.map((e) => `.${e}`))].join(',');

/**
 * The file's type as core knows it. Browsers leave `type` empty for some Office files on some systems, so
 * the extension decides when the browser does not say. Undefined = not a type we print.
 */
export function contentTypeOf(file: { name: string; type: string }): AcceptedContentType | undefined {
  if (file.type in ACCEPTED_FILE_TYPES) return file.type as AcceptedContentType;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return (Object.entries(ACCEPTED_FILE_TYPES) as Array<[AcceptedContentType, { ext: readonly string[] }]>).find(([, t]) => t.ext.includes(ext))?.[0];
}

/**
 * Sends the file to its upload target the way S3 expects a presigned POST: the signed fields first, the
 * file last. XMLHttpRequest rather than fetch, because only it reports upload progress.
 */
export function sendToTarget(target: UploadTarget, file: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', target.url);
    // Our own origin (development) needs the session cookie; S3 must not get it.
    xhr.withCredentials = target.url.startsWith('/');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, xhr.status === 413 ? 'too_large' : 'upload_failed', 'Upload failed')));
    xhr.onerror = () => reject(new ApiError(0, 'upload_failed', 'Upload failed'));
    xhr.send(form);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Asks until core has finished processing (counting pages, converting Office files): about two minutes at most. */
export async function waitUntilProcessed(id: string, { intervalMs = 1000, attempts = 120 } = {}): Promise<DocumentView> {
  for (let i = 0; i < attempts; i++) {
    const doc = await api<DocumentView>(`/documents/${id}`);
    if (doc.status !== 'processing' && doc.status !== 'awaiting_upload') return doc;
    await sleep(intervalMs);
  }
  throw new ApiError(0, 'processing_slow', 'Processing took too long');
}

/** The whole upload: register, send the file, confirm, wait for the page count. */
export async function uploadDocument(file: File, contentType: AcceptedContentType, onProgress: (fraction: number) => void, onProcessing: () => void): Promise<DocumentView> {
  const { document, upload } = await api<{ document: DocumentView; upload: UploadTarget }>('/documents', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType, sizeBytes: file.size }),
  });
  await sendToTarget(upload, file, onProgress);
  await api(`/documents/${document.id}/complete`, { method: 'POST' });
  onProcessing();
  return waitUntilProcessed(document.id);
}
