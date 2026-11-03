'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import styles from './forms.module.css';

interface FieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Shown after the label, e.g. "(optional)". */
  note?: string;
}

/** A labelled input whose hint and error are announced by screen readers (aria-describedby). */
export function Field({ label, hint, error, note, ...input }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {note ? <span className="muted"> ({note})</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="small muted">
          {hint}
        </p>
      ) : null}
      <input id={id} {...input} className={styles.input} aria-invalid={error ? true : undefined} aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined} />
      {error ? (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A password field with a show/hide toggle (fewer typos than a second "repeat password" field). */
export function PasswordField({ showLabel, hideLabel, ...props }: FieldProps & { showLabel: string; hideLabel: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <Field {...props} type={visible ? 'text' : 'password'} />
      <button type="button" className={styles.toggle} onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
        {visible ? hideLabel : showLabel}
      </button>
    </div>
  );
}

export function Checkbox({ label, error, ...input }: Omit<ComponentProps<'input'>, 'id' | 'type'> & { label: string; error?: string }) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <div className={styles.checkRow}>
        <input id={id} type="checkbox" {...input} className={styles.checkbox} aria-invalid={error ? true : undefined} aria-describedby={errorId} />
        <label htmlFor={id}>{label}</label>
      </div>
      {error ? (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A form-level message. Errors interrupt (role="alert"); confirmations are announced politely. */
export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`${styles.notice} ${styles[tone]}`}>
      {children}
    </div>
  );
}
