'use client';

import type { Locale, OrderView, PaymentView } from '@papperdash/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/forms/Field';
import forms from '@/components/forms/forms.module.css';
import { useSubmit } from '@/components/forms/useSubmit';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import type { Messages } from '@/i18n/en';
import { api, ApiError } from '@/lib/api';
import { goToCheckout } from '@/lib/checkout';
import { fill } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import styles from './orders.module.css';

type T = Pick<Messages, 'order' | 'print' | 'errors'>;
type Load = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error' } | { kind: 'ready'; order: OrderView; payment: PaymentView | null };

/** How long to keep asking after Stripe sends the customer back, before saying it takes longer than usual. */
const CONFIRM_POLLS = 30;

/**
 * One order: its status, what was ordered and what it costs. Stripe returns the customer here with
 * ?checkout=success or ?checkout=cancelled. After success the payment is confirmed by Stripe's webhook, which
 * can arrive a moment after the customer, so the page keeps asking until the order is paid.
 */
export function OrderDetails({ locale, id, t }: { locale: Locale; id: string; t: T }) {
  const router = useRouter();
  const session = useSession();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [returned, setReturned] = useState<'success' | 'cancelled' | null>(null);
  const [polls, setPolls] = useState(0);
  const pay = useSubmit(t.errors);
  const cancel = useSubmit(t.errors);
  const read = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [order, { payment }] = await Promise.all([api<OrderView>(`/orders/${encodeURIComponent(id)}`), api<{ payment: PaymentView | null }>(`/orders/${encodeURIComponent(id)}/payment`)]);
      setLoad({ kind: 'ready', order, payment });
    } catch (err) {
      setLoad(err instanceof ApiError && err.status === 404 ? { kind: 'missing' } : { kind: 'error' });
    }
  }, [id]);

  useEffect(() => {
    if (session.status === 'signed-out') router.replace(`/${locale}/login?next=/${locale}/orders/${id}`);
    if (session.status !== 'signed-in' || read.current) return;
    read.current = true;
    // Keep the address clean so a reload does not show the return message again.
    const url = new URL(window.location.href);
    const checkout = url.searchParams.get('checkout');
    if (checkout === 'success' || checkout === 'cancelled') setReturned(checkout);
    url.searchParams.delete('checkout');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    void refresh();
  }, [session.status, router, locale, id, refresh]);

  const waiting = load.kind === 'ready' && returned === 'success' && (load.order.state === 'Draft' || load.order.state === 'AwaitingPayment') && load.payment?.status !== 'processing';
  useEffect(() => {
    if (!waiting || polls >= CONFIRM_POLLS) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      void refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [waiting, polls, refresh]);

  if (load.kind === 'loading') return <p className="muted">{t.order.loading}</p>;
  if (load.kind === 'missing') return <Notice tone="error">{t.order.notFound}</Notice>;
  if (load.kind === 'error') return <Notice tone="error">{t.errors.generic}</Notice>;

  const { order, payment } = load;
  const unpaid = order.state === 'Draft' || order.state === 'AwaitingPayment';
  const processing = payment?.status === 'processing';
  const pickup = { 'walk-up': t.print.walkUp, locker: t.print.locker, delivery: t.print.delivery }[order.fulfilment];

  return (
    <div className={styles.order}>
      <h1 className="title">{fill(t.order.title, { reference: order.reference })}</h1>

      <div aria-live="polite">
        {waiting ? (
          <Notice tone="info">{polls >= CONFIRM_POLLS ? t.order.confirmingSlow : t.order.confirming}</Notice>
        ) : returned === 'success' && !unpaid && order.state !== 'Cancelled' ? (
          <Notice tone="success">
            <p className="heading">{t.order.paidTitle}</p>
            <p>{t.order.paidBody}</p>
          </Notice>
        ) : processing ? (
          <Notice tone="info">{t.order.processing}</Notice>
        ) : returned === 'cancelled' && unpaid ? (
          <Notice tone="info">{t.order.checkoutCancelled}</Notice>
        ) : order.state === 'Cancelled' ? (
          <Notice tone="info">{t.order.cancelled}</Notice>
        ) : null}
      </div>

      <dl className={styles.details}>
        <div>
          <dt>{t.order.status}</dt>
          <dd>
            <StatusChip state={order.state} locale={locale} />
          </dd>
        </div>
        <div>
          <dt>{t.order.file}</dt>
          <dd>{fill(t.order.filePages, { pages: String(order.pages), copies: String(order.settings.copies) })}</dd>
        </div>
        <div>
          <dt>{t.order.sides}</dt>
          <dd>{order.settings.duplex ? t.print.twoSided : t.print.oneSided}</dd>
        </div>
        <div>
          <dt>{t.order.pickup}</dt>
          <dd>{pickup}</dd>
        </div>
        {order.total ? (
          <div>
            <dt>{t.order.total}</dt>
            <dd className={styles.total} data-testid="order-total">
              {formatMoney(order.total, locale)}
            </dd>
          </div>
        ) : null}
      </dl>

      {pay.error.form ? <Notice tone="error">{pay.error.form}</Notice> : null}
      {cancel.error.form ? <Notice tone="error">{cancel.error.form}</Notice> : null}
      <div className={forms.actions}>
        {unpaid && !processing && order.total ? (
          <>
            <Button onClick={() => pay.run(() => goToCheckout(order.id))} aria-disabled={pay.pending || undefined}>
              {pay.pending ? t.order.redirecting : fill(t.order.pay, { amount: formatMoney(order.total, locale) })}
            </Button>
            <Button
              variant="secondary"
              aria-disabled={cancel.pending || undefined}
              onClick={() =>
                cancel.run(async () => {
                  await api(`/orders/${order.id}/cancel`, { method: 'POST' });
                  setReturned(null);
                  await refresh();
                })
              }
            >
              {t.order.cancel}
            </Button>
          </>
        ) : (
          <ButtonLink href={`/${locale}/print`} variant={order.state === 'Cancelled' ? 'primary' : 'secondary'}>
            {t.order.newOrder}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
