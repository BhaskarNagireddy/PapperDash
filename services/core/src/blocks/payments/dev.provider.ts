import { WebhookSignatureError, type Money, type PaymentProvider, type PaymentProviderEvent, type ProviderCheckout } from '@papperdash/contracts';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Where the test checkout page lives (on core, reached through the website's /v1 like every API call). */
export const DEV_CHECKOUT_PATH = '/v1/payments/dev-checkout';

interface DevSession {
  id: string;
  reference: string;
  amount: Money;
  status: ProviderCheckout['status'];
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

/**
 * A test payment provider for running PapperDash without Stripe keys: local development, manual testing and CI's
 * full-stack browser tests. It never moves money.
 *
 * It imitates Stripe Checkout: the customer is sent to a hosted page (served by core, DevCheckoutController),
 * chooses "Pay" or "Cancel", and the result comes back as a signed webhook through PaymentsService.handleWebhook:
 * the exact code path real Stripe payments take. The signing secret is random per process.
 *
 * Never used in production: loadConfig switches it on only outside production, and refuses to open ordering in
 * production without Stripe keys.
 */
export class DevPaymentProvider implements PaymentProvider {
  readonly id = 'dev';
  private readonly secret = randomBytes(32);
  private readonly sessions = new Map<string, DevSession>();
  private readonly byKey = new Map<string, string>();
  private seq = 0;

  async createCheckout(input: { reference: string; amount: Money; idempotencyKey: string; successUrl: string; cancelUrl: string; expiresAt: Date }): Promise<ProviderCheckout> {
    let id = this.byKey.get(input.idempotencyKey);
    if (!id) {
      id = `cs_dev_${randomBytes(8).toString('hex')}`;
      this.byKey.set(input.idempotencyKey, id);
      this.sessions.set(id, { id, reference: input.reference, amount: input.amount, status: 'requires_action', successUrl: input.successUrl, cancelUrl: input.cancelUrl, expiresAt: input.expiresAt });
    }
    return this.view(id);
  }

  async resumeCheckout(id: string): Promise<ProviderCheckout> {
    if (!this.sessions.has(id)) throw new Error(`Unknown test checkout ${id}`);
    return this.view(id);
  }

  async cancelCheckout(id: string): Promise<boolean> {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'requires_action') return false;
    s.status = 'cancelled';
    return true;
  }

  async refund(): Promise<{ providerRefundId: string; status: 'succeeded' }> {
    return { providerRefundId: `re_dev_${++this.seq}`, status: 'succeeded' };
  }

  parseWebhook(rawBody: Uint8Array, signature: string): PaymentProviderEvent {
    const expected = this.sign(rawBody);
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new WebhookSignatureError('Invalid test signature');
    return JSON.parse(Buffer.from(rawBody).toString('utf8')) as PaymentProviderEvent;
  }

  /** The open session, for the test checkout page. */
  session(id: string): Readonly<DevSession> | undefined {
    const s = this.sessions.get(id);
    // Closed by status only: core's own expiry job cancels abandoned orders, which closes the session here.
    return s && s.status === 'requires_action' ? s : undefined;
  }

  /** The customer pays on the test page: the signed webhook Stripe would send, and where to send them back. */
  pay(id: string): { rawBody: Buffer; signature: string; redirectTo: string } | undefined {
    const s = this.session(id);
    if (!s) return undefined;
    this.sessions.get(id)!.status = 'succeeded';
    const event: PaymentProviderEvent = { eventId: `evt_dev_${++this.seq}_${id}`, kind: 'payment.succeeded', providerPaymentId: id, paymentReference: `pi_dev_${id}`, amount: s.amount };
    const rawBody = Buffer.from(JSON.stringify(event));
    return { rawBody, signature: this.sign(rawBody).toString(), redirectTo: s.successUrl };
  }

  private sign(body: Uint8Array): Buffer {
    return Buffer.from(createHmac('sha256', this.secret).update(body).digest('hex'));
  }

  private view(id: string): ProviderCheckout {
    const s = this.sessions.get(id)!;
    return { providerPaymentId: id, checkoutUrl: `${DEV_CHECKOUT_PATH}/${id}`, status: s.status, expiresAt: s.expiresAt };
  }
}
