import { FULFILLED_RETENTION_HOURS, TERMINAL_STATES, UNPAID_RETENTION_HOURS, type OrderState } from '@papperdash/contracts';

const HOUR = 3600 * 1000;

export interface OrderLink {
  state: OrderState;
  changedAt: Date;
}

/**
 * When a document's files may be deleted (null = keep for now). The retention policy in one place:
 * - uploaded but never paid for: 2 hours after upload (or 2 hours after checkout started, if later);
 * - while any order using it is paid and not finished: kept, so a failed print can be retried;
 * - once every such order is completed or refunded: 24 hours after the last one ended.
 */
export function retainUntil(uploadedAt: Date, links: OrderLink[]): Date | null {
  const inProgress = links.some((l) => !TERMINAL_STATES.includes(l.state) && l.state !== 'Draft' && l.state !== 'AwaitingPayment');
  if (inProgress) return null;
  let until = uploadedAt.getTime() + UNPAID_RETENTION_HOURS * HOUR;
  for (const l of links) {
    if (l.state === 'AwaitingPayment') until = Math.max(until, l.changedAt.getTime() + UNPAID_RETENTION_HOURS * HOUR);
    if (l.state === 'Completed' || l.state === 'Refunded') until = Math.max(until, l.changedAt.getTime() + FULFILLED_RETENTION_HOURS * HOUR);
  }
  return new Date(until);
}
