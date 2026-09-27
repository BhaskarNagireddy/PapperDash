import { HttpException, HttpStatus, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { DomainEvent, Market, Money, PriceListInput, PriceListView, PriceTier, Quote, QuoteInput, QuoteLine } from '@papperdash/contracts';
import { and, desc, eq, lte } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { DB, type Db } from '../../platform/database.js';
import { Outbox } from '../../platform/events.js';
import { newId } from '../../platform/ids.js';
import { priceLists } from './pricing.schema.js';

type PriceListChanged = DomainEvent<'pricing.PriceListChanged', { market: Market; priceListId: string; changedBy: string }>;
type Row = typeof priceLists.$inferSelect;

@Injectable()
export class PricingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly outbox: Outbox,
  ) {}

  /** The price list in force now for a market. */
  async active(market: Market): Promise<PriceListView> {
    const [row] = await this.db
      .select()
      .from(priceLists)
      .where(and(eq(priceLists.market, market), lte(priceLists.activeFrom, this.clock.now())))
      .orderBy(desc(priceLists.activeFrom))
      .limit(1);
    if (!row) throw new ServiceUnavailableException({ error: 'pricing_not_configured', message: 'Ordering is not open in this area yet.' });
    return toView(row);
  }

  async history(market: Market, limit = 50): Promise<PriceListView[]> {
    const rows = await this.db.select().from(priceLists).where(eq(priceLists.market, market)).orderBy(desc(priceLists.activeFrom)).limit(limit);
    return rows.map(toView);
  }

  /**
   * Prices an order. The tier is chosen by printed pages (selected pages x copies) and gives the price
   * for the whole order, VAT included. Delivery is priced and charged by the delivery partner, not here.
   */
  async quote(input: QuoteInput): Promise<Quote> {
    const list = await this.active(input.market);
    const printedPages = input.pages * input.copies;
    if (printedPages > list.maxPages) {
      throw new HttpException(
        { error: 'too_many_pages', message: `PapperDash prints up to ${list.maxPages} pages per order. This order has ${printedPages}. Choose fewer pages or copies, or split it into several orders.`, maxPages: list.maxPages },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const tiers = input.colour === 'colour' ? list.colourTiers : list.bwTiers;
    if (!tiers) {
      throw new HttpException({ error: 'colour_unavailable', message: 'Colour printing is not available yet. Choose black and white.' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const tier = findTier(tiers, printedPages);
    const money = (amountMinor: number): Money => ({ amountMinor, currency: list.currency });

    const lines: QuoteLine[] = [
      { kind: 'printing', description: `${printedPages} ${printedPages === 1 ? 'page' : 'pages'}, ${input.colour === 'colour' ? 'colour' : 'black & white'}`, amount: money(tier.priceMinor) },
    ];

    const totalMinor = lines.reduce((sum, l) => sum + l.amount.amountMinor, 0);
    // Prices include VAT: VAT = total x rate / (1 + rate).
    const vatMinor = Math.round((totalMinor * list.vatRateBp) / (10_000 + list.vatRateBp));
    return { priceListId: list.id, printedPages, lines, total: money(totalMinor), vat: money(vatMinor) };
  }

  /** Admin: publish a new price list for a market, effective immediately. */
  async publish(market: Market, input: PriceListInput, changedBy: string): Promise<PriceListView> {
    const now = this.clock.now();
    const row: Row = { id: newId('prl'), market, ...input, activeFrom: now, createdBy: changedBy, createdAt: now };
    await this.db.transaction(async (tx) => {
      await tx.insert(priceLists).values(row);
      await this.outbox.append<PriceListChanged>(tx, { type: 'pricing.PriceListChanged', version: 1, aggregateId: market, payload: { market, priceListId: row.id, changedBy } });
    });
    return toView(row);
  }
}

function findTier(tiers: PriceTier[], pages: number): PriceTier {
  const tier = tiers.find((t) => pages >= t.fromPages && pages <= t.toPages);
  // Unreachable for validated price lists (tiers cover 1..maxPages); guard against hand-edited rows.
  if (!tier) throw new ServiceUnavailableException({ error: 'pricing_misconfigured', message: 'This order cannot be priced right now. Contact support.' });
  return tier;
}

function toView(r: Row): PriceListView {
  return {
    id: r.id,
    market: r.market as Market,
    currency: r.currency as Money['currency'],
    vatRateBp: r.vatRateBp,
    maxPages: r.maxPages,
    maxFileMb: r.maxFileMb,
    bwTiers: r.bwTiers as PriceTier[],
    colourTiers: (r.colourTiers as PriceTier[] | null) ?? null,
    activeFrom: r.activeFrom.toISOString(),
  };
}
