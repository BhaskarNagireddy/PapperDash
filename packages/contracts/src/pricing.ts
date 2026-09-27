import { z } from 'zod';
import { COLOUR_MODES, FULFILMENT_METHODS, type Money } from './orders.js';

export const MARKETS = ['SE'] as const;
export type Market = (typeof MARKETS)[number];

/**
 * A price for every order whose printed pages (pages x copies) fall in [fromPages, toPages].
 * Prices are in minor units (öre) and include VAT.
 */
export const PriceTier = z.object({
  fromPages: z.int().min(1),
  toPages: z.int().min(1),
  priceMinor: z.int().min(0).max(10_000_00),
});
export type PriceTier = z.infer<typeof PriceTier>;

/** Tiers must start at page 1 and cover every page up to maxPages with no gaps or overlaps. */
function tiersCover(tiers: PriceTier[], maxPages: number): string | null {
  let next = 1;
  for (const t of tiers) {
    if (t.fromPages !== next) return `Tier starting at ${t.fromPages} should start at ${next}`;
    if (t.toPages < t.fromPages) return `Tier ${t.fromPages}-${t.toPages} ends before it starts`;
    next = t.toPages + 1;
  }
  return next - 1 === maxPages ? null : `Tiers end at ${next - 1} pages but the order limit is ${maxPages}`;
}

export const PriceListInput = z
  .object({
    currency: z.enum(['SEK', 'DKK', 'EUR']),
    /** VAT included in the prices, in basis points (2500 = 25 %). */
    vatRateBp: z.int().min(0).max(5000),
    /** Most printed pages (pages x copies) one order may have. */
    maxPages: z.int().min(1).max(1000),
    /** Largest upload accepted, in megabytes. */
    maxFileMb: z.int().min(1).max(200),
    bwTiers: z.array(PriceTier).min(1).max(50),
    colourTiers: z.array(PriceTier).min(1).max(50),
    deliveryFeeMinor: z.int().min(0).max(100_000),
  })
  .superRefine((p, ctx) => {
    for (const key of ['bwTiers', 'colourTiers'] as const) {
      const problem = tiersCover(p[key], p.maxPages);
      if (problem) ctx.addIssue({ code: 'custom', path: [key], message: problem });
    }
  });
export type PriceListInput = z.infer<typeof PriceListInput>;

export interface PriceListView extends PriceListInput {
  id: string;
  market: Market;
  activeFrom: string;
}

export const QuoteInput = z.object({
  market: z.enum(MARKETS).default('SE'),
  /** Pages selected for printing from the document (after the page range is applied). */
  pages: z.int().min(1).max(10_000),
  copies: z.int().min(1).max(100).default(1),
  colour: z.enum(COLOUR_MODES).default('bw'),
  fulfilment: z.enum(FULFILMENT_METHODS),
});
export type QuoteInput = z.infer<typeof QuoteInput>;

export interface QuoteLine {
  kind: 'printing' | 'delivery';
  description: string;
  amount: Money;
}

export interface Quote {
  priceListId: string;
  printedPages: number;
  lines: QuoteLine[];
  total: Money;
  /** The VAT contained in the total. */
  vat: Money;
}
