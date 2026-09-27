import { WebhookSignatureError, type Money, type PaymentProvider, type PaymentProviderEvent, type ProviderPayment } from '@papperdash/contracts';

/**
 * A stand-in payment provider with Stripe's semantics: idempotent creation, cancellable open payments,
 * refunds, and webhooks signed with a shared secret. Tests drive it like Stripe would.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly publishableKey = 'pk_test_fake';
  readonly intents = new Map<string, { id: string; amount: Money; status: ProviderPayment['status']; orderId: string }>();
  private readonly byKey = new Map<string, string>();
  refundStatus: 'pending' | 'succeeded' | 'error' = 'succeeded';
  readonly refunds: { id: string; providerPaymentId: string; amount: Money }[] = [];
  private seq = 0;

  async createPayment(input: { orderId: string; amount: Money; idempotencyKey: string }): Promise<ProviderPayment> {
    const existing = this.byKey.get(input.idempotencyKey);
    const id = existing ?? `pi_fake_${++this.seq}`;
    if (!existing) {
      this.byKey.set(input.idempotencyKey, id);
      this.intents.set(id, { id, amount: input.amount, status: 'requires_action', orderId: input.orderId });
    }
    return this.view(id);
  }
  async resumePayment(id: string) {
    return this.view(id);
  }
  async cancelPayment(id: string) {
    const i = this.intents.get(id)!;
    if (i.status === 'succeeded') return false;
    i.status = 'cancelled';
    return true;
  }
  async refund(input: { providerPaymentId: string; amount: Money }) {
    if (this.refundStatus === 'error') throw new Error('Charge has already been disputed');
    const id = `re_fake_${++this.seq}`;
    this.refunds.push({ id, providerPaymentId: input.providerPaymentId, amount: input.amount });
    return { providerRefundId: id, status: this.refundStatus as 'pending' | 'succeeded' };
  }
  parseWebhook(rawBody: Uint8Array, signature: string): PaymentProviderEvent {
    if (signature !== 'fake-valid-signature') throw new WebhookSignatureError('bad signature');
    return JSON.parse(Buffer.from(rawBody).toString('utf8')) as PaymentProviderEvent;
  }

  /** What Stripe does when the customer completes payment: the intent succeeds and a webhook is sent. */
  succeed(id: string, eventId = `evt_${++this.seq}`): PaymentProviderEvent {
    const i = this.intents.get(id)!;
    i.status = 'succeeded';
    return { eventId, kind: 'payment.succeeded', providerPaymentId: id, amount: i.amount };
  }

  private view(id: string): ProviderPayment {
    const i = this.intents.get(id)!;
    return { providerPaymentId: id, clientSecret: `${id}_secret`, status: i.status };
  }
}
