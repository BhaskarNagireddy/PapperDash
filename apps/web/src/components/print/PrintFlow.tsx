'use client';

import type { CreateOrderInput, DocumentView, FulfilmentMethod, Locale, OrderQuoteView, OrderView, PriceListView, ServiceStatus, StationView } from '@papperdash/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Notice } from '@/components/forms/Field';
import forms from '@/components/forms/forms.module.css';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { useSubmit } from '@/components/forms/useSubmit';
import { ButtonLink } from '@/components/ui/Button';
import type { Messages } from '@/i18n/en';
import { api } from '@/lib/api';
import { fill, toFormError, type FormError } from '@/lib/errors';
import { goToCheckout } from '@/lib/checkout';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { FilePicker } from './FilePicker';
import styles from './print.module.css';

type T = Pick<Messages, 'print' | 'rejections' | 'errors' | 'form'>;

export interface PrintChoices {
  copies: number;
  someP: boolean;
  pageRange: string;
  duplex: boolean;
  fulfilment: FulfilmentMethod;
  stationId: string;
}

/** The order input for the current choices, or null while a station is still needed. */
export function orderInput(documentId: string, c: PrintChoices): CreateOrderInput | null {
  const needsStation = c.fulfilment !== 'delivery';
  if (needsStation && !c.stationId) return null;
  return {
    documentId,
    settings: { colour: 'bw', duplex: c.duplex, copies: c.copies, paperSize: 'A4', ...(c.someP && c.pageRange.trim() ? { pageRange: c.pageRange.trim() } : {}) },
    fulfilment: c.fulfilment,
    ...(needsStation ? { stationId: c.stationId } : {}),
  };
}

type QuoteState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; value: OrderQuoteView } | { kind: 'error'; error: FormError };

/**
 * Upload → settings → pick-up → price → order, on one page. The price is always core's own quote for this
 * document (its real page count, the page range and copies), the same check the order runs, so the price
 * shown is the price charged.
 */
export function PrintFlow({ locale, t }: { locale: Locale; t: T }) {
  const router = useRouter();
  const session = useSession();
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [stations, setStations] = useState<StationView[]>([]);
  const [prices, setPrices] = useState<PriceListView | null>(null);
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [choices, setChoices] = useState<PrintChoices>({ copies: 1, someP: false, pageRange: '', duplex: false, fulfilment: 'delivery', stationId: '' });
  const [quote, setQuote] = useState<QuoteState>({ kind: 'idle' });
  const [ordered, setOrdered] = useState<OrderView | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const placing = useSubmit(t.errors);

  useEffect(() => {
    if (session.status === 'signed-out') router.replace(`/${locale}/login?next=/${locale}/print`);
  }, [session.status, router, locale]);

  useEffect(() => {
    api<ServiceStatus>('/status').then(setStatus, () => setStatus({ ordering: false }));
    api<PriceListView>('/pricing').then(setPrices, () => setPrices(null));
    api<{ stations: StationView[] }>('/stations').then(
      ({ stations: list }) => {
        setStations(list);
        // Printing at the station is the main way; offer it first when a station is open.
        if (list[0]) setChoices((c) => ({ ...c, fulfilment: 'walk-up', stationId: list[0]!.id }));
      },
      () => setStations([]),
    );
  }, []);

  const input = useMemo(() => (doc?.status === 'ready' ? orderInput(doc.id, choices) : null), [doc, choices]);
  const inputKey = input ? JSON.stringify(input) : '';

  // Re-price shortly after the last change; an answer for older choices is ignored.
  const latest = useRef('');
  useEffect(() => {
    latest.current = inputKey;
    if (!input) return setQuote({ kind: 'idle' });
    setQuote({ kind: 'loading' });
    const timer = setTimeout(() => {
      api<OrderQuoteView>('/orders/quote', { method: 'POST', body: JSON.stringify(input) }).then(
        (value) => latest.current === inputKey && setQuote({ kind: 'ready', value }),
        (err: unknown) => latest.current === inputKey && setQuote({ kind: 'error', error: toFormError(err, t.errors) }),
      );
    }, 300);
    return () => clearTimeout(timer);
    // inputKey stands for input: re-price only when the choices really change, not on every new object.
  }, [inputKey, t.errors]);

  if (session.status !== 'signed-in') return <p className="muted">{t.print.loading}</p>;
  const user = session.user;
  const set = (patch: Partial<PrintChoices>) => setChoices((c) => ({ ...c, ...patch }));
  const lockerStations = stations.filter((s) => s.lockers);
  const stationChoices = choices.fulfilment === 'locker' ? lockerStations : stations;

  if (ordered) {
    return (
      <>
        <Notice tone="info">
          <p className="heading">{fill(t.print.orderedTitle, { reference: ordered.reference })}</p>
          <p>{t.print.orderedBody}</p>
        </Notice>
        {placing.error.form ? <Notice tone="error">{placing.error.form}</Notice> : null}
        <div className={forms.actions}>
          <ButtonLink href={`/${locale}/orders/${ordered.id}`}>{t.print.openOrder}</ButtonLink>
        </div>
      </>
    );
  }

  const ready = doc?.status === 'ready';
  return (
    <div className={styles.flow}>
      <section className={styles.section} aria-labelledby="file-title">
        <h2 id="file-title" className="heading">
          {t.print.fileTitle}
        </h2>
        <FilePicker locale={locale} t={t} maxFileMb={prices?.maxFileMb ?? 50} doc={doc} onChange={setDoc} />
      </section>

      <fieldset className={styles.section} disabled={!ready}>
        <legend className="heading">{t.print.settingsTitle}</legend>
        <div className={styles.field}>
          <label htmlFor="copies" className={forms.label}>
            {t.print.copies}
          </label>
          <input
            id="copies"
            className={`${forms.input} ${styles.narrow}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={choices.copies}
            onChange={(e) => set({ copies: Math.max(1, Math.min(100, Math.trunc(Number(e.target.value)) || 1)) })}
          />
        </div>
        <fieldset className={styles.choices}>
          <legend className={forms.label}>{t.print.pages}</legend>
          <Radio name="pages" checked={!choices.someP} onChange={() => set({ someP: false })} label={t.print.allPages} />
          <Radio name="pages" checked={choices.someP} onChange={() => set({ someP: true })} label={t.print.somePages} />
          {choices.someP ? (
            <div className={styles.field}>
              <label htmlFor="page-range" className={forms.label}>
                {t.print.pageRange}
              </label>
              <p id="page-range-hint" className="small muted">
                {t.print.pageRangeHint}
              </p>
              <input
                id="page-range"
                className={`${forms.input} ${styles.narrow}`}
                inputMode="numeric"
                autoComplete="off"
                value={choices.pageRange}
                aria-describedby="page-range-hint"
                aria-invalid={quote.kind === 'error' && !!quote.error.fields.pageRange ? true : undefined}
                onChange={(e) => set({ pageRange: e.target.value })}
              />
            </div>
          ) : null}
        </fieldset>
        <fieldset className={styles.choices}>
          <legend className={forms.label}>{t.print.sides}</legend>
          <Radio name="sides" checked={!choices.duplex} onChange={() => set({ duplex: false })} label={t.print.oneSided} />
          <Radio name="sides" checked={choices.duplex} onChange={() => set({ duplex: true })} label={t.print.twoSided} />
        </fieldset>
        <dl className={styles.fixed}>
          <div>
            <dt className={forms.label}>{t.print.colour}</dt>
            <dd>
              {t.print.bw}
              {prices && !prices.colourTiers ? <span className="small muted"> · {t.print.colourLater}</span> : null}
            </dd>
          </div>
          <div>
            <dt className={forms.label}>{t.print.paper}</dt>
            <dd>{t.print.paperA4}</dd>
          </div>
        </dl>
      </fieldset>

      <fieldset className={styles.section} disabled={!ready}>
        <legend className="heading">{t.print.pickupTitle}</legend>
        <div className={styles.choices}>
          <Radio
            name="fulfilment"
            checked={choices.fulfilment === 'walk-up'}
            disabled={!stations.length}
            onChange={() => set({ fulfilment: 'walk-up', stationId: stations[0]?.id ?? '' })}
            label={t.print.walkUp}
            body={t.print.walkUpBody}
          />
          <Radio
            name="fulfilment"
            checked={choices.fulfilment === 'locker'}
            disabled={!lockerStations.length}
            onChange={() => set({ fulfilment: 'locker', stationId: lockerStations[0]?.id ?? '' })}
            label={t.print.locker}
            body={t.print.lockerBody}
          />
          <Radio name="fulfilment" checked={choices.fulfilment === 'delivery'} onChange={() => set({ fulfilment: 'delivery', stationId: '' })} label={t.print.delivery} body={t.print.deliveryBody} />
        </div>
        {!stations.length ? (
          <p className="small muted">{t.print.noStations}</p>
        ) : !lockerStations.length ? (
          <p className="small muted">{t.print.noLockerStations}</p>
        ) : null}
        {choices.fulfilment !== 'delivery' && stationChoices.length ? (
          <div className={styles.field}>
            <label htmlFor="station" className={forms.label}>
              {t.print.station}
            </label>
            <select id="station" className={forms.input} value={choices.stationId} onChange={(e) => set({ stationId: e.target.value })}>
              {stationChoices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.address}, {s.city}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <section className={styles.section} aria-labelledby="price-title">
        <h2 id="price-title" className="heading">
          {t.print.priceTitle}
        </h2>
        <div aria-live="polite">
          <Price locale={locale} t={t} quote={quote} copies={choices.copies} delivery={choices.fulfilment === 'delivery'} />
        </div>
        {status && !status.ordering ? (
          <>
            <Notice tone="info">{t.print.orderingClosed}</Notice>
            <div className={forms.actions}>
              <ButtonLink href={`/${locale}/waitlist`}>{t.print.joinWaitlist}</ButtonLink>
            </div>
          </>
        ) : status?.ordering && !user.emailVerified ? (
          <>
            <Notice tone="info">{t.print.verifyFirst}</Notice>
            <div className={forms.actions}>
              <ButtonLink href={`/${locale}/account`}>{t.print.toAccount}</ButtonLink>
            </div>
          </>
        ) : status?.ordering ? (
          <form
            className={forms.form}
            onSubmit={(e) => {
              e.preventDefault();
              if (!input || quote.kind !== 'ready') return;
              void placing.run(async () => {
                const order = await api<OrderView>('/orders', { method: 'POST', body: JSON.stringify(input) });
                setRedirecting(true);
                try {
                  await goToCheckout(order.id);
                } catch (err) {
                  // The order is saved; the customer can pay from its page.
                  setRedirecting(false);
                  setOrdered(order);
                  throw err;
                }
              });
            }}
          >
            {placing.error.form ? <Notice tone="error">{placing.error.form}</Notice> : null}
            <div className={forms.actions}>
              <SubmitButton pending={placing.pending || redirecting || quote.kind !== 'ready'} label={t.print.placeOrder} sending={redirecting ? t.print.redirecting : t.form.sending} />
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}

function Price({ locale, t, quote, copies, delivery }: { locale: Locale; t: T; quote: QuoteState; copies: number; delivery: boolean }) {
  switch (quote.kind) {
    case 'idle':
      return <p className="muted">{t.print.priceWaiting}</p>;
    case 'loading':
      return <p className="muted">{t.print.calculating}</p>;
    case 'error':
      return <Notice tone="error">{quote.error.form}</Notice>;
    case 'ready': {
      const { pages, quote: q } = quote.value;
      return (
        <div className={styles.price}>
          <p className="muted">{fill(t.print.printedPages, { pages: String(pages), copies: String(copies), printed: String(q.printedPages) })}</p>
          <p className={styles.total}>
            <span>{t.print.total}</span> <strong data-testid="price-total">{formatMoney(q.total, locale)}</strong>
          </p>
          <p className="small muted">{fill(t.print.vatIncluded, { vat: formatMoney(q.vat, locale) })}</p>
          {delivery ? <p className="small muted">{t.print.deliveryNote}</p> : null}
        </div>
      );
    }
  }
}

function Radio({ name, checked, onChange, label, body, disabled }: { name: string; checked: boolean; onChange: () => void; label: string; body?: string; disabled?: boolean }) {
  return (
    <label className={`${styles.radio} ${checked ? styles.radioChecked : ''}`} aria-disabled={disabled || undefined}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} />
      <span>
        <span className={styles.radioLabel}>{label}</span>
        {body ? <span className="small muted">{body}</span> : null}
      </span>
    </label>
  );
}
