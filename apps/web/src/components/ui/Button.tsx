import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import styles from './ui.module.css';

type Variant = 'primary' | 'secondary';
const cls = (variant: Variant) => `${styles.button} ${styles[variant]}`;

/** Primary = ink fill with paper text: one per screen. Secondary for everything else. */
export function Button({ variant = 'primary', ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" {...props} className={cls(variant)} />;
}

export function ButtonLink({ variant = 'primary', href, children }: { variant?: Variant; href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cls(variant)}>
      {children}
    </Link>
  );
}
