'use client';

import type { Locale, OrderView } from '@papperdash/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Notice } from '@/components/forms/Field';
import forms from '@/components/forms/forms.module.css';
import { ButtonLink } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { fill } from '@/lib/errors';
import { formatMoney, formatTime } from '@/lib/money';
import { useSession } from '@/lib/session';
import styles from './orders.module.css';

type T = Pick<Messages, 'orders' | 'account' | 'errors'>;

/** The customer's orders, newest first, each linking to its own page. */
export function OrdersList({ locale, t }: { locale: Locale; t: T }) {
  const router = useRouter();
  const session = useSession();
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (session.status === 'signed-out') router.replace(`/${locale}/login?next=/${locale}/orders`);
    if (session.status !== 'signed-in') return;
    api<{ orders: OrderView[] }>('/orders').then(
      (r) => setOrders(r.orders),
      () => setFailed(true),
    );
  }, [session.status, router, locale]);

  if (failed) return <Notice tone="error">{t.errors.generic}</Notice>;
  if (!orders) return <p className="muted">{t.orders.loading}</p>;
  if (!orders.length) {
    return (
      <>
        <p>{t.orders.empty}</p>
        <div className={forms.actions}>
          <ButtonLink href={`/${locale}/print`}>{t.account.print}</ButtonLink>
        </div>
      </>
    );
  }
  return (
    <ul className={styles.list}>
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/${locale}/orders/${o.id}`} className={styles.row}>
            <span className={styles.rowRef}>{o.reference}</span>
            <span>{o.total ? formatMoney(o.total, locale) : null}</span>
            <span className={`${styles.rowMeta} small muted`}>{fill(t.orders.placed, { date: formatTime(o.createdAt, locale) })}</span>
            <StatusChip state={o.state} locale={locale} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
