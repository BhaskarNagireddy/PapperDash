import { WebhookSignatureError, type Money, type PaymentProvider, type PaymentProviderEvent, type ProviderCheckout } from '@papperdash/contracts';
import Stripe from 'stripe';

export interface StripeSettings {
  /** A restricted key (rk_) with only the permissions listed in ADR 0007, or a secret key (sk_). */
  secretKey: string;
  webhookSecret: string;
  /**
   * Stripe Tax on each checkout. Only switch on after the business has an active VAT registration recorded
   * in Stripe (Dashboard → Tax → Locations): without one, Stripe silently collects no tax.
   */
  automaticTax: boolean;
}

/** Tags our checkouts in the Stripe Dashboard so this flow can be compared with future ones. */
const INTEGRATION_IDENTIFIER = 'papperdash-order-checkout-rkvtmhqa';

/**
 * Stripe adapter using Checkout Sessions (Stripe's recommended API for one-time payments), hosted by Stripe.
 * No payment method types are passed, so the methods enabled in the Dashboard (card, Apple Pay, Google Pay,
 * Klarna) are offered dynamically. Card data never reaches PapperDash.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  private readonly stripe: Stripe;

  /** `httpClient` is replaceable so tests can check the exact requests sent to Stripe. */
  constructor(
    private readonly settings: StripeSettings,
    httpClient?: Stripe.HttpClient,
  ) {
    this.stripe = new Stripe(settings.secretKey, { maxNetworkRetries: 2, appInfo: { name: 'PapperDash' }, ...(httpClient ? { httpClient } : {}) });
  }

  async createCheckout(input: {
    orderId: string;
    reference: string;
    amount: Money;
    customerEmail: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
  }): Promise<ProviderCheckout> {
    const metadata = { orderId: input.orderId, reference: input.reference };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.amount.currency.toLowerCase(),
              unit_amount: input.amount.amountMinor,
              // PapperDash prices include Swedish VAT (25 %).
              tax_behavior: 'inclusive',
              product_data: { name: `PapperDash print order ${input.reference}` },
            },
          },
        ],
        automatic_tax: { enabled: this.settings.automaticTax },
        customer_email: input.customerEmail,
        client_reference_id: input.orderId,
        metadata,
        payment_intent_data: { metadata, description: `PapperDash order ${input.reference}` },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        integration_identifier: INTEGRATION_IDENTIFIER,
      },
      // The same key returns the same session, so a retried request never creates a second checkout.
      { idempotencyKey: input.idempotencyKey },
    );
    return toCheckout(session);
  }

  async resumeCheckout(providerPaymentId: string): Promise<ProviderCheckout> {
    return toCheckout(await this.stripe.checkout.sessions.retrieve(providerPaymentId));
  }

  async cancelCheckout(providerPaymentId: string): Promise<boolean> {
    try {
      await this.stripe.checkout.sessions.expire(providerPaymentId);
      return true;
    } catch (err) {
      // Only an open session can be expired; a completed one means the customer already paid.
      if ((err as { type?: string }).type === 'StripeInvalidRequestError') return false;
      throw err;
    }
  }

  async refund(input: { paymentReference: string; amount: Money; idempotencyKey: string }) {
    const refund = await this.stripe.refunds.create(
      { payment_intent: input.paymentReference, amount: input.amount.amountMinor, reason: 'requested_by_customer' },
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
      // Paid only when payment_status says so: Klarna and other delayed methods complete the session unpaid
      // and confirm later with async_payment_succeeded (or _failed).
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const s = event.data.object;
        const paymentReference = idOf(s.payment_intent);
        if (s.payment_status === 'unpaid' || !paymentReference) {
          return { eventId: event.id, kind: 'payment.processing', providerPaymentId: s.id, paymentReference };
        }
        return {
          eventId: event.id,
          kind: 'payment.succeeded',
          providerPaymentId: s.id,
          paymentReference,
          amount: { amountMinor: s.amount_total ?? 0, currency: (s.currency ?? '').toUpperCase() as Money['currency'] },
        };
      }
      case 'checkout.session.async_payment_failed':
        return { eventId: event.id, kind: 'payment.failed', providerPaymentId: event.data.object.id };
      case 'checkout.session.expired':
        return { eventId: event.id, kind: 'payment.expired', providerPaymentId: event.data.object.id };
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
        return { eventId: event.id, kind: 'refund.updated', providerRefundId: event.data.object.id, status: refundStatus(event.data.object.status) };
      default:
        return { eventId: event.id, kind: 'ignored', type: event.type };
    }
  }
}

function toCheckout(s: Stripe.Checkout.Session): ProviderCheckout {
  const status: ProviderCheckout['status'] =
    s.status === 'expired' ? 'cancelled' : s.status === 'complete' ? (s.payment_status === 'unpaid' ? 'processing' : 'succeeded') : 'requires_action';
  return { providerPaymentId: s.id, checkoutUrl: s.url ?? '', status, expiresAt: new Date(s.expires_at * 1000) };
}

const idOf = (v: string | { id: string } | null): string | null => (v == null ? null : typeof v === 'string' ? v : v.id);

function refundStatus(s: string | null): 'pending' | 'succeeded' | 'failed' {
  return s === 'succeeded' ? 'succeeded' : s === 'failed' || s === 'canceled' ? 'failed' : 'pending';
}
