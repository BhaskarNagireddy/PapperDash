'use client';

import type { DocumentView, Locale } from '@papperdash/contracts';
import { useRef, useState, type DragEvent } from 'react';
import { Notice } from '@/components/forms/Field';
import forms from '@/components/forms/forms.module.css';
import ui from '@/components/ui/ui.module.css';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { fill, toFormError } from '@/lib/errors';
import { formatTime } from '@/lib/money';
import { ACCEPT, contentTypeOf, uploadDocument } from '@/lib/upload';
import styles from './print.module.css';

type T = Pick<Messages, 'print' | 'rejections' | 'errors'>;
type Phase = { kind: 'empty' } | { kind: 'uploading'; name: string; percent: number } | { kind: 'processing'; name: string } | { kind: 'error'; message: string };

/** Choose or drop one file, upload it straight to storage, and wait for core to count its pages. */
export function FilePicker({ locale, t, maxFileMb, doc, onChange }: { locale: Locale; t: T; maxFileMb: number; doc: DocumentView | null; onChange: (doc: DocumentView | null) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'empty' });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(file: File) {
    const contentType = contentTypeOf(file);
    if (!contentType) return setPhase({ kind: 'error', message: t.rejections.unsupported_type });
    if (file.size > maxFileMb * 1024 * 1024) return setPhase({ kind: 'error', message: fill(t.errors.tooLarge, { mb: String(maxFileMb) }) });
    if (file.size === 0) return setPhase({ kind: 'error', message: t.rejections.empty });
    if (doc) void api(`/documents/${doc.id}`, { method: 'DELETE' }).catch(() => undefined); // the old file is not needed any more
    onChange(null);
    setPhase({ kind: 'uploading', name: file.name, percent: 0 });
    try {
      const result = await uploadDocument(
        file,
        contentType,
        (f) => setPhase({ kind: 'uploading', name: file.name, percent: Math.round(f * 100) }),
        () => setPhase({ kind: 'processing', name: file.name }),
      );
      if (result.status === 'ready') {
        setPhase({ kind: 'empty' });
        onChange(result);
      } else {
        setPhase({ kind: 'error', message: result.rejection ? t.rejections[result.rejection.reason] : t.errors.generic });
      }
    } catch (err) {
      setPhase({ kind: 'error', message: toFormError(err, t.errors).form ?? t.errors.generic });
    }
  }

  async function remove() {
    if (!doc) return;
    await api(`/documents/${doc.id}`, { method: 'DELETE' }).catch(() => undefined);
    onChange(null);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void start(file);
  };
  const busy = phase.kind === 'uploading' || phase.kind === 'processing';

  return (
    <div className={styles.picker}>
      {doc ? (
        <div className={styles.fileCard}>
          <p className={styles.fileName}>{doc.fileName}</p>
          <p data-testid="page-count">{doc.pageCount === 1 ? t.print.readyOne : fill(t.print.readyMany, { pages: String(doc.pageCount) })}</p>
          {doc.deleteAfter ? <p className="small muted">{fill(t.print.deletedAt, { time: formatTime(doc.deleteAfter, locale) })}</p> : null}
        </div>
      ) : null}

      <div
        className={`${styles.drop} ${dragging ? styles.dropActive : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={input}
          id="file"
          type="file"
          accept={ACCEPT}
          className={styles.fileInput}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // choosing the same file again still starts an upload
            if (file) void start(file);
          }}
        />
        <label htmlFor="file" className={`${ui.button} ${ui.secondary}`} aria-disabled={busy || undefined}>
          {doc ? t.print.otherFile : t.print.chooseFile}
        </label>
        <p className="small muted">{fill(t.print.dropHint, { mb: String(maxFileMb) })}</p>
      </div>

      <div aria-live="polite">
        {phase.kind === 'uploading' ? (
          <div className={styles.progressRow}>
            <p>{fill(t.print.uploading, { name: phase.name, percent: String(phase.percent) })}</p>
            <progress max={100} value={phase.percent} className={styles.progress} aria-label={phase.name} />
          </div>
        ) : phase.kind === 'processing' ? (
          <p>{fill(t.print.processing, { name: phase.name })}</p>
        ) : null}
      </div>
      {phase.kind === 'error' ? <Notice tone="error">{phase.message}</Notice> : null}

      {doc ? (
        <div className={forms.actions}>
          <button type="button" className={styles.linkButton} onClick={() => void remove()}>
            {t.print.removeFile}
          </button>
        </div>
      ) : null}
    </div>
  );
}
