import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  canTransition,
  selectedPages,
  type CreateOrderInput,
  type CurrentUser,
  type FulfilmentMethod,
  type Money,
  type OrderActor,
  type OrderEvent,
  type OrderState,
  type OrderView,
  type PrintSettings,
  type Role,
} from '@papperdash/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { DB, type Db } from '../../platform/database.js';
import { Outbox } from '../../platform/events.js';
import { humanCode, newId } from '../../platform/ids.js';
import { DocumentsService } from '../documents/index.js';
import { PricingService } from '../pricing/index.js';
import { orderStateHistory, orders } from './orders.schema.js';

type OrderRow = typeof orders.$inferSelect;

const STAFF_ROLES: Role[] = ['support', 'admin'];

export class InvalidTransitionError extends ConflictException {
  constructor(from: OrderState, to: OrderState) {
    super({ error: 'invalid_transition', message: `An order cannot go from ${from} to ${to}.` });
  }
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly outbox: Outbox,
    private readonly documents: DocumentsService,
    private readonly pricing: PricingService,
  ) {}

  async create(user: CurrentUser, input: CreateOrderInput): Promise<OrderView> {
    if (!user.emailVerified) {
      throw new ForbiddenException({ error: 'email_not_verified', message: 'Confirm your email address before placing an order. Check your inbox for the link.' });
    }
    // A session opened by scanning a station's QR code can only order at that station.
    let stationId = input.stationId ?? null;
    if (user.stationId) {
      if (input.fulfilment !== 'walk-up' || (stationId && stationId !== user.stationId)) {
        throw new ForbiddenException({ error: 'station_session', message: 'At a station you can only print here. Use your phone for pickup or delivery orders.' });
      }
      stationId = user.stationId;
    }
    // The file must be the customer's own and ready; the page range must exist in it; the price list must accept it.
    const { pageCount } = await this.documents.getPrintable(user.id, input.documentId);
    const selection = selectedPages(input.settings.pageRange, pageCount);
    if ('error' in selection) throw new BadRequestException({ error: 'invalid_page_range', message: selection.error });
    const pages = selection.pages.length;
    const quote = await this.pricing.quote({ market: 'SE', pages, copies: input.settings.copies, colour: input.settings.colour, fulfilment: input.fulfilment });
    const now = this.clock.now();
    const row: OrderRow = {
      id: newId('ord'),
      reference: `PD-${humanCode(6)}`,
      customerId: user.id,
      documentId: input.documentId,
      settings: input.settings,
      pages,
      fulfilment: input.fulfilment,
      stationId,
      state: 'Draft',
      // The price is fixed when the order is created and shown before payment.
      totalMinor: quote.total.amountMinor,
      currency: quote.total.currency,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values(row);
      await this.outbox.append<OrderEvent>(tx, {
        type: 'orders.OrderCreated',
        version: 1,
        aggregateId: row.id,
        payload: { orderId: row.id, customerId: user.id, fulfilment: input.fulfilment, stationId, documentId: input.documentId },
      });
    });
    return toView(row);
  }

  async listForCustomer(customerId: string, limit = 50): Promise<OrderView[]> {
    const rows = await this.db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).limit(limit);
    return rows.map(toView);
  }

  /** Customers see only their own orders; support and admin see all. Others get 404, never 403, so IDs are not probeable. */
  async getForUser(user: CurrentUser, orderId: string): Promise<OrderView> {
    const row = await this.find(orderId);
    if (!row || (row.customerId !== user.id && !user.roles.some((r) => STAFF_ROLES.includes(r)))) throw new NotFoundException();
    return toView(row);
  }

  async history(orderId: string) {
    return this.db.select().from(orderStateHistory).where(eq(orderStateHistory.orderId, orderId)).orderBy(orderStateHistory.at);
  }

  async cancelByCustomer(user: CurrentUser, orderId: string): Promise<OrderView> {
    const order = await this.getForUser(user, orderId);
    if (order.customerId !== user.id) throw new NotFoundException();
    if (order.state !== 'Draft' && order.state !== 'AwaitingPayment') {
      throw new ConflictException({ error: 'not_cancellable', message: 'This order is already paid. Contact support to cancel it.' });
    }
    return this.transition(orderId, 'Cancelled', { kind: 'customer', userId: user.id });
  }

  /** Called by the pricing/payments flow once a quote is accepted: stores the total and waits for payment. */
  async awaitPayment(orderId: string, total: Money, actor: OrderActor): Promise<OrderView> {
    return this.transition(orderId, 'AwaitingPayment', actor, undefined, { totalMinor: total.amountMinor, currency: total.currency });
  }

  /**
   * The only way an order changes state. Checks the state machine, then compare-and-sets on
   * the current state and version, so concurrent attempts (two lockers, a double webhook) cannot both succeed.
   */
  async transition(
    orderId: string,
    to: OrderState,
    actor: OrderActor,
    reason?: string,
    extra: Partial<Pick<OrderRow, 'totalMinor' | 'currency'>> = {},
  ): Promise<OrderView> {
    const current = await this.find(orderId);
    if (!current) throw new NotFoundException();
    const from = current.state as OrderState;
    if (!canTransition(from, to, current.fulfilment as FulfilmentMethod)) throw new InvalidTransitionError(from, to);

    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(orders)
        .set({ state: to, version: current.version + 1, updatedAt: now, ...extra })
        .where(and(eq(orders.id, orderId), eq(orders.state, from), eq(orders.version, current.version)))
        .returning();
      if (!updated) throw new ConflictException({ error: 'concurrent_update', message: 'The order changed while this was being processed. Reload and try again.' });
      await tx.insert(orderStateHistory).values({ id: newId('osh'), orderId, fromState: from, toState: to, actor, reason: reason ?? null, at: now });
      await this.outbox.append<OrderEvent>(tx, {
        type: 'orders.OrderStateChanged',
        version: 1,
        aggregateId: orderId,
        payload: { orderId, from, to, actor, ...(reason ? { reason } : {}) },
      });
      return toView(updated);
    });
  }

  private async find(orderId: string): Promise<OrderRow | undefined> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    return row;
  }
}

function toView(r: OrderRow): OrderView {
  return {
    id: r.id,
    reference: r.reference,
    customerId: r.customerId,
    documentId: r.documentId,
    settings: r.settings as PrintSettings,
    pages: r.pages,
    fulfilment: r.fulfilment as FulfilmentMethod,
    stationId: r.stationId,
    state: r.state as OrderState,
    total: r.totalMinor != null && r.currency ? { amountMinor: r.totalMinor, currency: r.currency as Money['currency'] } : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
