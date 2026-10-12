import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { DB, type Db } from '../../platform/database.js';
import { Outbox } from '../../platform/events.js';
import { humanCode, newId } from '../../platform/ids.js';
import { Leases } from '../../platform/leases.js';
import { PeriodicJob } from '../../platform/periodic.js';
import { DocumentsService } from '../documents/index.js';
import { PricingService } from '../pricing/index.js';
import { orderStateHistory, orders } from './orders.schema.js';

type OrderRow = typeof orders.$inferSelect;

const STAFF_ROLES: Role[] = ['support', 'admin'];
/** A draft nobody has paid for in a day is abandoned. Cancelling it lets its file be deleted on schedule. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export class InvalidTransitionError extends ConflictException {
  constructor(from: OrderState, to: OrderState) {
    super({ error: 'invalid_transition', message: `An order cannot go from ${from} to ${to}.` });
  }
}

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OrdersService.name);
  private readonly expiryJob = new PeriodicJob('Draft expiry', this.log);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly leases: Leases,
    private readonly outbox: Outbox,
    private readonly documents: DocumentsService,
    private readonly pricing: PricingService,
  ) {}

  onModuleInit() {
    // One instance runs it per interval; the lease outlives the interval so others skip rather than repeat it.
    this.expiryJob.start(this.config.expirySweepMs, () => this.leases.runExclusive('draft-expiry', this.config.expirySweepMs, () => this.expireDrafts()));
  }

  onModuleDestroy() {
    return this.expiryJob.stop();
  }

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

  /** For other blocks acting on behalf of the system (payments, fulfilment). Not exposed over HTTP. */
  async getById(orderId: string): Promise<OrderView | null> {
    const row = await this.find(orderId);
    return row ? toView(row) : null;
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

  /** IDs of orders that have been in `state` since before `olderThan`, oldest first. For expiry jobs. */
  async staleIds(state: OrderState, olderThan: Date, limit = 200): Promise<string[]> {
    const rows = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.state, state), lt(orders.updatedAt, olderThan)))
      .orderBy(asc(orders.updatedAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** Cancels drafts older than DRAFT_TTL_MS. Returns how many were cancelled. */
  async expireDrafts(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - DRAFT_TTL_MS);
    let cancelled = 0;
    for (const id of await this.staleIds('Draft', cutoff)) {
      if (await this.cancelIfUnchanged(id, 'Draft', { kind: 'system', block: 'orders' }, 'Not paid within 24 hours')) cancelled++;
    }
    return cancelled;
  }

  /**
   * Cancels on behalf of the system unless the order moved on meanwhile (the customer paid or cancelled it
   * themselves, or another instance got there first). Returns whether this call cancelled it.
   */
  async cancelIfUnchanged(orderId: string, expected: OrderState, actor: OrderActor, reason: string): Promise<boolean> {
    try {
      const current = await this.find(orderId);
      if (current?.state !== expected) return false;
      // Applied to the row just read: if it changes before the write, the version check rejects it.
      await this.apply(current, 'Cancelled', actor, reason);
      return true;
    } catch (err) {
      if (err instanceof ConflictException) return false;
      throw err;
    }
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
    return this.apply(current, to, actor, reason, extra);
  }

  private async apply(
    current: OrderRow,
    to: OrderState,
    actor: OrderActor,
    reason?: string,
    extra: Partial<Pick<OrderRow, 'totalMinor' | 'currency'>> = {},
  ): Promise<OrderView> {
    const orderId = current.id;
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
