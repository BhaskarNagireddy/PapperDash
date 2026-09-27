import { ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import {
  OPEN_PAYMENT_STATUSES,
  TERMINAL_STATES,
  WebhookSignatureError,
  canTransition,
  type CheckoutView,
  type CurrentUser,
  type Money,
  type OrderActor,
  type OrderStateChanged,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentStatus,
  type PaymentView,
  type RefundInput,
  type RefundIssued,
  type RefundStatus,
  type RefundView,
  type PaymentSucceeded,
} from '@papperdash/contracts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { DB, type Db, type DbOrTx } from '../../platform/database.js';
import { EventBus, Outbox } from '../../platform/events.js';
import { newId } from '../../platform/ids.js';
import { OrdersService } from '../orders/index.js';
import { payments, refunds, webhookEvents } from './payments.schema.js';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

type PaymentRow = typeof payments.$inferSelect;
type RefundRow = typeof refunds.$inferSelect;

const SYSTEM: OrderActor = { kind: 'system', block: 'payments' };
/** Stripe's minimum Checkout Session lifetime. */
const CHECKOUT_TTL_MS = 30 * 60 * 1000;
/** A checkout about to expire is replaced rather than resumed, so the customer is not sent to a page that dies mid-payment. */
const RESUME_MARGIN_MS = 5 * 60 * 1000;

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly outbox: Outbox,
    private readonly bus: EventBus,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit() {
    // Order changes happen in reaction to payment events, so a crash between the two is retried, never lost.
    // These call the orders block and Stripe, so they run outside the relay's transaction and are idempotent.
    const own = { transactional: false };
    this.bus.subscribe<PaymentSucceeded>('payments.PaymentSucceeded', 'payments.mark-order-paid', (e) => this.markOrderPaid(e.payload.paymentId), own);
    this.bus.subscribe<RefundIssued>('payments.RefundIssued', 'payments.mark-order-refunded', (e) => this.markOrderRefunded(e.payload), own);
    this.bus.subscribe<OrderStateChanged>(
      'orders.OrderStateChanged',
      'payments.cancel-open-payment',
      async (e) => {
        if (e.payload.to === 'Cancelled') await this.cancelOpenPayments(e.payload.orderId);
      },
      own,
    );
  }

  // ---------- Customer: checkout ----------

  /**
   * Starts (or resumes) paying for an order at the price stored on it. Returns the Stripe Checkout page to
   * send the customer to. Calling it again while that page is still open returns the same page.
   */
  async checkout(user: CurrentUser, orderId: string): Promise<CheckoutView> {
    const provider = this.requireProvider();
    let order = await this.orders.getForUser(user, orderId);
    if (order.customerId !== user.id) throw new NotFoundException();
    if (!order.total) throw new ConflictException({ error: 'no_price', message: 'This order has no price yet. Create it again.' });
    if (order.state === 'Cancelled') throw new ConflictException({ error: 'order_cancelled', message: 'This order was cancelled. Place a new order to print.' });
    if (order.state !== 'Draft' && order.state !== 'AwaitingPayment') {
      throw new ConflictException({ error: 'already_paid', message: 'This order is already paid.' });
    }
    if (order.state === 'Draft') order = await this.orders.awaitPayment(order.id, order.total, { kind: 'customer', userId: user.id });

    const latest = await this.latestPayment(order.id);
    if (latest?.status === 'succeeded') throw new ConflictException({ error: 'already_paid', message: 'This order is already paid.' });
    if (latest?.status === 'processing') {
      throw new ConflictException({ error: 'payment_processing', message: 'Your payment is being confirmed by your bank or Klarna. You will be notified when it is done.' });
    }
    const now = this.clock.now();
    if (latest?.status === 'requires_action' && latest.expiresAt.getTime() - now.getTime() > RESUME_MARGIN_MS) {
      const resumed = await provider.resumeCheckout(latest.providerPaymentId);
      if (resumed.status === 'requires_action') return this.checkoutView(latest, resumed.checkoutUrl, resumed.status);
    }

    const attempt = (latest?.attempt ?? 0) + 1;
    const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS);
    const orderPage = `${this.config.publicWebUrl}/orders/${order.id}`;
    const created = await provider.createCheckout({
      orderId: order.id,
      reference: order.reference,
      amount: order.total!,
      customerEmail: user.email,
      idempotencyKey: `checkout:${order.id}:${attempt}`,
      // papperdash.se links open the app through Universal Links / App Links, so both web and app return here.
      successUrl: `${orderPage}?checkout=success`,
      cancelUrl: `${orderPage}?checkout=cancelled`,
      expiresAt,
    });
    const row: PaymentRow = {
      id: newId('pay'),
      orderId: order.id,
      customerId: user.id,
      attempt,
      provider: provider.id,
      providerPaymentId: created.providerPaymentId,
      paymentReference: null,
      expiresAt: created.expiresAt,
      amountMinor: order.total!.amountMinor,
      currency: order.total!.currency,
      status: created.status,
      createdAt: now,
      updatedAt: now,
      succeededAt: null,
    };
    // Two simultaneous checkouts use the same idempotency key, get the same session, and the second insert is a no-op.
    await this.db.insert(payments).values(row).onConflictDoNothing();
    const [stored] = await this.db.select().from(payments).where(eq(payments.providerPaymentId, created.providerPaymentId));
    return this.checkoutView(stored!, created.checkoutUrl, created.status);
  }

  async latestForOrder(user: CurrentUser, orderId: string): Promise<PaymentView | null> {
    await this.orders.getForUser(user, orderId); // ownership (or staff) check
    const p = await this.latestPayment(orderId);
    return p ? this.paymentView(p) : null;
  }

  // ---------- Webhooks ----------

  /** Applies a provider webhook exactly once. Signature failures are rejected so Stripe shows them as errors. */
  async handleWebhook(rawBody: Uint8Array, signature: string): Promise<void> {
    const provider = this.requireProvider();
    let event;
    try {
      event = provider.parseWebhook(rawBody, signature);
    } catch (err) {
      if (err instanceof WebhookSignatureError) throw new HttpException({ error: 'invalid_signature' }, HttpStatus.BAD_REQUEST);
      throw err;
    }
    if (event.kind === 'ignored') return;

    await this.db.transaction(async (tx) => {
      const fresh = await tx
        .insert(webhookEvents)
        .values({ provider: provider.id, eventId: event.eventId, kind: event.kind, receivedAt: this.clock.now() })
        .onConflictDoNothing()
        .returning();
      if (!fresh.length) return; // already applied

      if (event.kind === 'refund.updated') return this.applyRefundStatus(tx, event.providerRefundId, event.status);

      const [payment] = await tx.select().from(payments).where(eq(payments.providerPaymentId, event.providerPaymentId));
      if (!payment) {
        this.log.warn(`Webhook ${event.eventId} for unknown payment ${event.providerPaymentId}`);
        return;
      }
      if (event.kind === 'payment.processing') {
        if (payment.status === 'requires_action') {
          await tx.update(payments).set({ status: 'processing', paymentReference: event.paymentReference, updatedAt: this.clock.now() }).where(eq(payments.id, payment.id));
        }
      } else if (event.kind === 'payment.expired') {
        if (payment.status === 'requires_action') await tx.update(payments).set({ status: 'cancelled', updatedAt: this.clock.now() }).where(eq(payments.id, payment.id));
      } else if (event.kind === 'payment.failed') {
        if (payment.status === 'succeeded') return;
        await tx.update(payments).set({ status: 'failed', updatedAt: this.clock.now() }).where(eq(payments.id, payment.id));
        await this.outbox.append<PaymentEvent>(tx, { type: 'payments.PaymentFailed', version: 1, aggregateId: payment.orderId, payload: { paymentId: payment.id, orderId: payment.orderId } });
      } else if (event.kind === 'payment.succeeded') {
        if (payment.status === 'succeeded') return;
        if (event.amount.amountMinor !== payment.amountMinor || event.amount.currency !== payment.currency) {
          // Cannot happen with amounts we set ourselves; recorded loudly for support rather than trusted.
          this.log.error(`Payment ${payment.id} received ${event.amount.amountMinor} ${event.amount.currency}, expected ${payment.amountMinor} ${payment.currency}`);
        }
        const now = this.clock.now();
        await tx.update(payments).set({ status: 'succeeded', paymentReference: event.paymentReference, succeededAt: now, updatedAt: now }).where(eq(payments.id, payment.id));
        await this.outbox.append<PaymentEvent>(tx, {
          type: 'payments.PaymentSucceeded',
          version: 1,
          aggregateId: payment.orderId,
          payload: { paymentId: payment.id, orderId: payment.orderId, amount: event.amount },
        });
      }
    });
  }

  // ---------- Staff: refunds ----------

  /** Refunds part or all of an order's payment. A full refund moves the order to Refunded once the provider confirms it. */
  async refund(staff: CurrentUser, orderId: string, input: RefundInput): Promise<RefundView> {
    const order = await this.orders.getById(orderId);
    if (!order) throw new NotFoundException();
    const payment = await this.succeededPayment(orderId);
    if (!payment) throw new ConflictException({ error: 'not_paid', message: 'This order has no completed payment to refund.' });
    const remaining = payment.amountMinor - (await this.refundedOrPending(payment.id));
    if (remaining <= 0) throw new ConflictException({ error: 'already_refunded', message: 'This order has already been refunded in full.' });
    const amountMinor = input.amountMinor ?? remaining;
    if (amountMinor > remaining) {
      throw new HttpException({ error: 'refund_too_large', message: `At most ${formatKr(remaining)} can still be refunded.` }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const full = amountMinor === remaining && remaining === payment.amountMinor;
    if (full && !TERMINAL_STATES.includes(order.state) && !canTransition(order.state, 'Refunded', order.fulfilment)) {
      throw new ConflictException({
        error: 'not_refundable_now',
        message: `The order is ${order.state}. Move it to support (stop printing or delivery) before refunding in full, or refund part of it.`,
      });
    }
    return this.issueRefund(payment, amountMinor, full, input.reason, staff.id);
  }

  async refundsForOrder(orderId: string): Promise<RefundView[]> {
    const rows = await this.db.select().from(refunds).where(eq(refunds.orderId, orderId)).orderBy(desc(refunds.createdAt));
    return rows.map(refundView);
  }

  // ---------- internals ----------

  private async issueRefund(payment: PaymentRow, amountMinor: number, full: boolean, reason: string, requestedBy: string): Promise<RefundView> {
    const provider = this.requireProvider();
    const now = this.clock.now();
    const row: RefundRow = {
      id: newId('ref'),
      paymentId: payment.id,
      orderId: payment.orderId,
      providerRefundId: null,
      amountMinor,
      currency: payment.currency,
      full,
      reason,
      requestedBy,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(refunds).values(row);
    let res;
    try {
      if (!payment.paymentReference) throw new Error('payment has no provider reference');
      res = await provider.refund({ paymentReference: payment.paymentReference, amount: { amountMinor, currency: payment.currency as Money['currency'] }, idempotencyKey: `refund:${row.id}` });
    } catch (err) {
      // Stripe refused: record it as failed so it does not hold back the refundable amount, and tell staff.
      await this.db.update(refunds).set({ status: 'failed', updatedAt: this.clock.now() }).where(eq(refunds.id, row.id));
      this.log.error(`Refund ${row.id} for payment ${payment.id} was refused by ${provider.id}`, err as Error);
      throw new HttpException({ error: 'refund_failed', message: `${provider.id} refused the refund: ${(err as Error).message}` }, HttpStatus.BAD_GATEWAY);
    }
    await this.db.update(refunds).set({ providerRefundId: res.providerRefundId, updatedAt: this.clock.now() }).where(eq(refunds.id, row.id));
    await this.db.transaction((tx) => this.applyRefundStatus(tx, res.providerRefundId, res.status));
    const [stored] = await this.db.select().from(refunds).where(eq(refunds.id, row.id));
    return refundView(stored!);
  }

  /** Moves a refund to its new status; the first time it succeeds, publishes RefundIssued. */
  private async applyRefundStatus(tx: DbOrTx, providerRefundId: string, status: RefundStatus): Promise<void> {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.providerRefundId, providerRefundId));
    if (!refund || refund.status === status || refund.status === 'succeeded') return;
    await tx.update(refunds).set({ status, updatedAt: this.clock.now() }).where(eq(refunds.id, refund.id));
    if (status === 'succeeded') {
      await this.outbox.append<PaymentEvent>(tx, {
        type: 'payments.RefundIssued',
        version: 1,
        aggregateId: refund.orderId,
        payload: {
          refundId: refund.id,
          paymentId: refund.paymentId,
          orderId: refund.orderId,
          amount: { amountMinor: refund.amountMinor, currency: refund.currency as Money['currency'] },
          full: refund.full,
        },
      });
    }
  }

  private async markOrderPaid(paymentId: string): Promise<void> {
    const [payment] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    const order = payment && (await this.orders.getById(payment.orderId));
    if (!payment || !order) return;
    if (order.state === 'AwaitingPayment') {
      await this.orders.transition(order.id, 'Paid', SYSTEM);
    } else if (order.state === 'Cancelled') {
      // The customer cancelled while the payment was still completing: give the money back automatically.
      // Checked against earlier refunds so a re-run of this handler never refunds twice.
      if ((await this.refundedOrPending(payment.id)) === 0) {
        await this.issueRefund(payment, payment.amountMinor, true, 'Order was cancelled before the payment completed', 'system');
      }
    }
    // Any other state means the order already moved on (e.g. a duplicate event): nothing to do.
  }

  private async markOrderRefunded(e: RefundIssued['payload']): Promise<void> {
    if (!e.full) return;
    const order = await this.orders.getById(e.orderId);
    if (order && canTransition(order.state, 'Refunded', order.fulfilment)) {
      await this.orders.transition(order.id, 'Refunded', SYSTEM, `Refund ${e.refundId}`);
    }
  }

  private async cancelOpenPayments(orderId: string): Promise<void> {
    if (!this.provider) return;
    const open = await this.db.select().from(payments).where(and(eq(payments.orderId, orderId), inArray(payments.status, [...OPEN_PAYMENT_STATUSES])));
    for (const p of open) {
      // If it was already paid, the success webhook arrives next and refunds automatically.
      if (await this.provider.cancelCheckout(p.providerPaymentId)) {
        await this.db.update(payments).set({ status: 'cancelled', updatedAt: this.clock.now() }).where(eq(payments.id, p.id));
      }
    }
  }

  private async latestPayment(orderId: string): Promise<PaymentRow | undefined> {
    const [row] = await this.db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.attempt)).limit(1);
    return row;
  }

  private async succeededPayment(orderId: string): Promise<PaymentRow | undefined> {
    const [row] = await this.db.select().from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, 'succeeded')));
    return row;
  }

  private async refundedOrPending(paymentId: string): Promise<number> {
    const rows = await this.db.select().from(refunds).where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, ['pending', 'succeeded'])));
    return rows.reduce((s, r) => s + r.amountMinor, 0);
  }

  private requireProvider(): PaymentProvider {
    if (!this.provider) throw new ServiceUnavailableException({ error: 'payments_unavailable', message: 'Payments are not available right now. Try again later.' });
    return this.provider;
  }

  private checkoutView(p: PaymentRow, checkoutUrl: string, status: PaymentStatus): CheckoutView {
    return {
      paymentId: p.id,
      orderId: p.orderId,
      status,
      amount: { amountMinor: p.amountMinor, currency: p.currency as Money['currency'] },
      provider: p.provider,
      checkoutUrl,
      expiresAt: p.expiresAt.toISOString(),
    };
  }

  private async paymentView(p: PaymentRow): Promise<PaymentView> {
    return {
      id: p.id,
      orderId: p.orderId,
      status: p.status as PaymentStatus,
      amount: { amountMinor: p.amountMinor, currency: p.currency as Money['currency'] },
      refundedMinor: (await this.db.select().from(refunds).where(and(eq(refunds.paymentId, p.id), eq(refunds.status, 'succeeded')))).reduce((s, r) => s + r.amountMinor, 0),
      createdAt: p.createdAt.toISOString(),
    };
  }
}

const formatKr = (minor: number) => `${(minor / 100).toFixed(2).replace('.', ',')} kr`;

function refundView(r: RefundRow): RefundView {
  return {
    id: r.id,
    paymentId: r.paymentId,
    orderId: r.orderId,
    amount: { amountMinor: r.amountMinor, currency: r.currency as Money['currency'] },
    status: r.status as RefundStatus,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  };
}
