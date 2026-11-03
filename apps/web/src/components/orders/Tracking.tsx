import { ORDER_STATE_LABELS, orderTracking, type FulfilmentMethod, type Locale, type OrderState } from '@papperdash/contracts';
import styles from './orders.module.css';

/** The order's milestones for its way of reaching the customer, with the current one marked for screen readers. */
export function Tracking({ fulfilment, state, locale, title }: { fulfilment: FulfilmentMethod; state: OrderState; locale: Locale; title: string }) {
  const steps = orderTracking(fulfilment, state);
  if (!steps) return null;
  return (
    <section aria-labelledby="tracking-title" className={styles.tracking}>
      <h2 id="tracking-title" className="heading">
        {title}
      </h2>
      <ol className={styles.steps}>
        {steps.map((s) => (
          <li key={s.state} className={styles[s.status]} aria-current={s.status === 'current' ? 'step' : undefined} data-status={s.status}>
            <span className={styles.dot} aria-hidden="true" />
            {ORDER_STATE_LABELS[s.state][locale]}
          </li>
        ))}
      </ol>
    </section>
  );
}
