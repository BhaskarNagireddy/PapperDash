import { ORDER_STATE_LABELS, type Locale, type OrderState } from '@papperdash/contracts';
import styles from './ui.module.css';

const TONE: Record<OrderState, 'progress' | 'done' | 'problem' | 'waiting'> = {
  Draft: 'waiting', AwaitingPayment: 'waiting', Paid: 'progress', Queued: 'progress', Printing: 'progress', Printed: 'progress',
  Ready: 'progress', ReadyForCourier: 'progress', OutForDelivery: 'progress', Delivered: 'done', Collected: 'done', Completed: 'done',
  DeliveryFailed: 'problem', Failed: 'problem', SupportRequired: 'problem', Refunded: 'waiting', Cancelled: 'waiting',
};
const TONE_CLASS = { progress: styles.chipProgress, done: styles.chipDone, problem: styles.chipProblem, waiting: styles.chipWaiting };

/** An order's state in the exact words every PapperDash surface uses; the word carries the meaning, colour only helps. */
export function StatusChip({ state, locale }: { state: OrderState; locale: Locale }) {
  return <span className={`${styles.chip} ${TONE_CLASS[TONE[state]]}`}>{ORDER_STATE_LABELS[state][locale]}</span>;
}
