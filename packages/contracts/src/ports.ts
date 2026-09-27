import type { Money } from './orders.js';

/**
 * Ports: the only way blocks reach vendors. Each vendor is an adapter implementing one of these,
 * selected per market in configuration (docs/decisions/0002-ports-and-adapters-for-vendors.md).
 */

export interface ProviderPayment {
  providerPaymentId: string;
  /** For the client-side payment form (Stripe Payment Element / PaymentSheet). Never stored by PapperDash. */
  clientSecret: string;
  status: 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
}

/** A provider webhook, verified and translated into PapperDash terms. */
export type PaymentProviderEvent =
  | { eventId: string; kind: 'payment.succeeded'; providerPaymentId: string; amount: Money }
  | { eventId: string; kind: 'payment.failed'; providerPaymentId: string }
  | { eventId: string; kind: 'payment.processing'; providerPaymentId: string }
  | { eventId: string; kind: 'refund.updated'; providerRefundId: string; status: 'pending' | 'succeeded' | 'failed' }
  | { eventId: string; kind: 'ignored'; type: string };

export class WebhookSignatureError extends Error {}

export interface PaymentProvider {
  readonly id: string; // 'stripe', 'swish', ...
  /** Key the client uses to render the payment form. */
  readonly publishableKey: string;
  createPayment(input: { orderId: string; reference: string; amount: Money; customerEmail: string; idempotencyKey: string }): Promise<ProviderPayment>;
  /** Fetches an open payment again, e.g. when the customer returns to checkout. */
  resumePayment(providerPaymentId: string): Promise<ProviderPayment>;
  /** Cancels a payment that has not succeeded; returns false if it can no longer be cancelled. */
  cancelPayment(providerPaymentId: string): Promise<boolean>;
  refund(input: { providerPaymentId: string; amount: Money; idempotencyKey: string }): Promise<{ providerRefundId: string; status: 'pending' | 'succeeded' | 'failed' }>;
  /** Verifies the webhook signature over the raw body; throws WebhookSignatureError if it does not match. */
  parseWebhook(rawBody: Uint8Array, signature: string): PaymentProviderEvent;
}

/**
 * A delivery partner's platform. The partner quotes and charges the delivery fee to the customer in its own
 * flow; PapperDash only hands over the printed order and tracks its status.
 */
export interface CourierProvider {
  readonly id: string; // 'wolt', 'foodora', 'budbee', ...
  requestPickup(input: { orderId: string; stationId: string; dropoff: DeliveryAddress }): Promise<{ providerJobId: string }>;
  cancel(providerJobId: string): Promise<void>;
}

export interface DeliveryAddress {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: 'SE' | 'DK';
  phone: string;
  instructions?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
