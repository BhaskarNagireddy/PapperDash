import type { Money } from './orders.js';

/**
 * Ports: the only way blocks reach vendors. Each vendor is an adapter implementing one of these,
 * selected per market in configuration (docs/decisions/0002-ports-and-adapters-for-vendors.md).
 */

export interface PaymentProvider {
  readonly id: string; // 'stripe', 'swish', ...
  createPayment(input: { orderId: string; amount: Money; customerEmail: string; returnUrl: string; idempotencyKey: string }): Promise<{
    providerPaymentId: string;
    /** Where to send the customer, or a client secret for an embedded form. */
    redirectUrl?: string;
    clientSecret?: string;
  }>;
  refund(input: { providerPaymentId: string; amount: Money; idempotencyKey: string }): Promise<{ providerRefundId: string }>;
}

export interface CourierProvider {
  readonly id: string; // 'own-riders', 'budbee', ...
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
