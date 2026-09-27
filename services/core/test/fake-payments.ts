import { WebhookSignatureError, type Money, type PaymentProvider, type PaymentProviderEvent, type ProviderCheckout } from '@papperdash/contracts';

interface FakeSession {
  id: string;
  amount: Money;
  status: ProviderCheckout['status'];
  orderId: string;
  paymentReference: string;
  expiresAt: Date;
  successUrl: string;
}

/**
 * A stand-in for Stripe Checkout with Stripe's semantics: idempotent session creation, sessions that can be
 * expired until paid, refunds against the PaymentIntent, and signed webhooks. Tests drive it like Stripe would.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly sessions = new Map<string, FakeSession>();
  private readonly byKey = new Map<string, string>();
  refundStatus: 'pending' | 'succeeded' | 'error' = 'succeeded';
  readonly refunds: { id: string; paymentReference: string; amount: Money }[] = [];
  private seq = 0;

  async createCheckout(input: { orderId: string; amount: Money; idempotencyKey: string; expiresAt: Date; successUrl: string }): Promise<ProviderCheckout> {
    const existing = this.byKey.get(input.idempotencyKey);
    const id = existing ?? `cs_fake_${++this.seq}`;
    if (!existing) {
      this.byKey.set(input.idempotencyKey, id);
      this.sessions.set(id, { id, amount: input.amount, status: 'requires_action', orderId: input.orderId, paymentReference: `pi_for_${id}`, expiresAt: input.expiresAt, successUrl: input.successUrl });
    }
    return this.view(id);
  }
  async resumeCheckout(id: string) {
    return this.view(id);
  }
  async cancelCheckout(id: string) {
    const s = this.sessions.get(id)!;
    if (s.status !== 'requires_action') return false;
    s.status = 'cancelled';
    return true;
  }
  async refund(input: { paymentReference: string; amount: Money }) {
    if (this.refundStatus === 'error') throw new Error('Charge has already been disputed');
    const id = `re_fake_${++this.seq}`;
    this.refunds.push({ id, paymentReference: input.paymentReference, amount: input.amount });
    return { providerRefundId: id, status: this.refundStatus as 'pending' | 'succeeded' };
  }
  parseWebhook(rawBody: Uint8Array, signature: string): PaymentProviderEvent {
    if (signature !== 'fake-valid-signature') throw new WebhookSignatureError('bad signature');
    return JSON.parse(Buffer.from(rawBody).toString('utf8')) as PaymentProviderEvent;
  }

  /** The newest checkout session. */
  latest(): FakeSession {
    return [...this.sessions.values()].pop()!;
  }

  /** The customer pays on the Stripe page: the session completes and Stripe sends the webhook. */
  pay(id: string, eventId = `evt_${++this.seq}`): PaymentProviderEvent {
    const s = this.sessions.get(id)!;
    s.status = 'succeeded';
    return { eventId, kind: 'payment.succeeded', providerPaymentId: id, paymentReference: s.paymentReference, amount: s.amount };
  }

  /** A delayed method (Klarna): the session completes unpaid; the result arrives later. */
  payLater(id: string): PaymentProviderEvent {
    const s = this.sessions.get(id)!;
    s.status = 'processing';
    return { eventId: `evt_${++this.seq}`, kind: 'payment.processing', providerPaymentId: id, paymentReference: s.paymentReference };
  }

  private view(id: string): ProviderCheckout {
    const s = this.sessions.get(id)!;
    return { providerPaymentId: id, checkoutUrl: `https://checkout.stripe.test/c/pay/${id}`, status: s.status, expiresAt: s.expiresAt };
  }
}
