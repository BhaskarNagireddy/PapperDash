import { WebhookSignatureError, type Money, type PaymentProvider, type PaymentProviderEvent, type ProviderPayment } from '@papperdash/contracts';
import Stripe from 'stripe';

export interface StripeSettings {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

/**
 * Stripe adapter. One PaymentIntent per checkout attempt with automatic payment methods, so the
 * methods enabled in the Stripe Dashboard (card, Apple Pay, Google Pay, Klarna) are offered without code changes.
 * Card data never reaches PapperDash: the client confirms the payment directly with Stripe.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly publishableKey: string;
  private readonly stripe: Stripe;

  /** `httpClient` is replaceable so tests can check the exact requests sent to Stripe. */
  constructor(
    private readonly settings: StripeSettings,
    httpClient?: Stripe.HttpClient,
  ) {
    this.publishableKey = settings.publishableKey;
    this.stripe = new Stripe(settings.secretKey, { maxNetworkRetries: 2, appInfo: { name: 'PapperDash' }, ...(httpClient ? { httpClient } : {}) });
  }

  async createPayment(input: { orderId: string; reference: string; amount: Money; customerEmail: string; idempotencyKey: string }): Promise<ProviderPayment> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amount.amountMinor,
        currency: input.amount.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: input.customerEmail,
        description: `PapperDash order ${input.reference}`,
        metadata: { orderId: input.orderId, reference: input.reference },
      },
      // The same key returns the same PaymentIntent, so a retried request never charges twice.
      { idempotencyKey: input.idempotencyKey },
    );
    return toProviderPayment(intent);
  }

  async resumePayment(providerPaymentId: string): Promise<ProviderPayment> {
    return toProviderPayment(await this.stripe.paymentIntents.retrieve(providerPaymentId));
  }

  async cancelPayment(providerPaymentId: string): Promise<boolean> {
    try {
      await this.stripe.paymentIntents.cancel(providerPaymentId);
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === 'payment_intent_unexpected_state') return false;
      throw err;
    }
  }

  async refund(input: { providerPaymentId: string; amount: Money; idempotencyKey: string }) {
    const refund = await this.stripe.refunds.create(
      { payment_intent: input.providerPaymentId, amount: input.amount.amountMinor, reason: 'requested_by_customer' },
      { idempotencyKey: input.idempotencyKey },
    );
    return { providerRefundId: refund.id, status: refundStatus(refund.status) };
  }

  parseWebhook(rawBody: Uint8Array, signature: string): PaymentProviderEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(Buffer.from(rawBody), signature, this.settings.webhookSecret);
    } catch (err) {
      throw new WebhookSignatureError((err as Error).message);
    }
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        return {
          eventId: event.id,
          kind: 'payment.succeeded',
          providerPaymentId: pi.id,
          amount: { amountMinor: pi.amount_received, currency: pi.currency.toUpperCase() as Money['currency'] },
        };
      }
      case 'payment_intent.payment_failed':
        return { eventId: event.id, kind: 'payment.failed', providerPaymentId: event.data.object.id };
      case 'payment_intent.processing':
        return { eventId: event.id, kind: 'payment.processing', providerPaymentId: event.data.object.id };
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
        return { eventId: event.id, kind: 'refund.updated', providerRefundId: event.data.object.id, status: refundStatus(event.data.object.status) };
      default:
        return { eventId: event.id, kind: 'ignored', type: event.type };
    }
  }
}

function toProviderPayment(pi: Stripe.PaymentIntent): ProviderPayment {
  const status: ProviderPayment['status'] =
    pi.status === 'succeeded' ? 'succeeded' : pi.status === 'processing' || pi.status === 'requires_capture' ? 'processing' : pi.status === 'canceled' ? 'cancelled' : 'requires_action';
  return { providerPaymentId: pi.id, clientSecret: pi.client_secret ?? '', status };
}

function refundStatus(s: string | null): 'pending' | 'succeeded' | 'failed' {
  return s === 'succeeded' ? 'succeeded' : s === 'failed' || s === 'canceled' ? 'failed' : 'pending';
}
