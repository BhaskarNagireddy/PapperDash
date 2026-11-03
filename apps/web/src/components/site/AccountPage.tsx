import type { ReactNode } from 'react';
import styles from '@/components/forms/forms.module.css';

/** The narrow column every account and waitlist page uses: heading, optional intro, then the form. */
export function AccountPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="page">
      <div className={styles.shell}>
        <h1 className="title">{title}</h1>
        {intro ? <p>{intro}</p> : null}
        {children}
      </div>
    </div>
  );
}
