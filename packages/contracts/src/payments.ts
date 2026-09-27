import { z } from 'zod';
import type { DomainEvent } from './events.js';
import type { Money } from './orders.js';

export const PAYMENT_STATUSES = ['requires_action', 'processing', 'succeeded', 'failed', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
/** A payment the customer can still complete; a new checkout resumes it instead of charging twice. */
export const OPEN_PAYMENT_STATUSES: readonly PaymentStatus[] = ['requires_action', 'processing'];

export const REFUND_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/**
 * What the app or website needs to show the payment form: Stripe's Payment Element (web) or
 * PaymentSheet (iOS/Android) with `clientSecret`. Card, Apple Pay, Google Pay and Klarna are offered
 * as enabled in the Stripe Dashboard.
 */
export interface CheckoutView {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  amount: Money;
  provider: string;
  clientSecret: string;
  publishableKey: string;
}

export interface PaymentView {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: Money;
  refundedMinor: number;
  createdAt: string;
}

export const RefundInput = z.object({
  /** Omit for a full refund of what remains. */
  amountMinor: z.int().min(1).optional(),
  reason: z.string().trim().min(3).max(500),
});
export type RefundInput = z.infer<typeof RefundInput>;

export interface RefundView {
  id: string;
  paymentId: string;
  orderId: string;
  amount: Money;
  status: RefundStatus;
  reason: string;
  createdAt: string;
}

export type PaymentSucceeded = DomainEvent<'payments.PaymentSucceeded', { paymentId: string; orderId: string; amount: Money }>;
export type PaymentFailed = DomainEvent<'payments.PaymentFailed', { paymentId: string; orderId: string }>;
export type RefundIssued = DomainEvent<'payments.RefundIssued', { refundId: string; paymentId: string; orderId: string; amount: Money; full: boolean }>;
export type PaymentEvent = PaymentSucceeded | PaymentFailed | RefundIssued;
