import type { ComponentProps } from 'react';
import styles from './ui.module.css';

/** Content raised onto `card` from the `paper` page. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={[styles.card, className].filter(Boolean).join(' ')} />;
}
