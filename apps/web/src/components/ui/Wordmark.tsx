import Link from 'next/link';
import styles from './ui.module.css';

/** Interim logo per the design system: "PapperDash" in 800 weight, followed by the yellow dash. */
export function Wordmark({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={styles.wordmark} aria-label={label}>
      PapperDash<span className={styles.dash} aria-hidden="true" />
    </Link>
  );
}
