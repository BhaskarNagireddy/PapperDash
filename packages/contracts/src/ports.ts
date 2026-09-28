import type { Money } from './orders.js';

/**
 * Ports: the only way blocks reach vendors. Each vendor is an adapter implementing one of these,
 * selected per market in configuration (docs/decisions/0002-ports-and-adapters-for-vendors.md).
 */

export interface ProviderCheckout {
  /** The provider's checkout ID (a Stripe Checkout Session). */
  providerPaymentId: string;
  checkoutUrl: string;
  status: 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  expiresAt: Date;
}

/** A provider webhook, verified and translated into PapperDash terms. */
export type PaymentProviderEvent =
  | {
      eventId: string;
      kind: 'payment.succeeded';
      providerPaymentId: string;
      /** The provider's reference for the money movement (a Stripe PaymentIntent), used for refunds. */
      paymentReference: string;
      amount: Money;
    }
  | { eventId: string; kind: 'payment.failed'; providerPaymentId: string }
  | { eventId: string; kind: 'payment.processing'; providerPaymentId: string; paymentReference: string | null }
  | { eventId: string; kind: 'payment.expired'; providerPaymentId: string }
  | { eventId: string; kind: 'refund.updated'; providerRefundId: string; status: 'pending' | 'succeeded' | 'failed' }
  | { eventId: string; kind: 'ignored'; type: string };

export class WebhookSignatureError extends Error {}

export interface PaymentProvider {
  readonly id: string; // 'stripe', 'swish', ...
  createCheckout(input: {
    orderId: string;
    reference: string;
    amount: Money;
    customerEmail: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
  }): Promise<ProviderCheckout>;
  /** Fetches an open checkout again, e.g. when the customer returns to pay. */
  resumeCheckout(providerPaymentId: string): Promise<ProviderCheckout>;
  /** Closes a checkout that has not been paid; returns false if it can no longer be closed. */
  cancelCheckout(providerPaymentId: string): Promise<boolean>;
  refund(input: { paymentReference: string; amount: Money; idempotencyKey: string }): Promise<{ providerRefundId: string; status: 'pending' | 'succeeded' | 'failed' }>;
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
