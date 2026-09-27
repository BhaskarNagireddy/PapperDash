import { describe, expect, it } from 'vitest';
import { PriceListInput } from './pricing.js';

const tiers = [
  { fromPages: 1, toPages: 5, priceMinor: 1000 },
  { fromPages: 6, toPages: 15, priceMinor: 1600 },
  { fromPages: 16, toPages: 25, priceMinor: 2500 },
  { fromPages: 26, toPages: 50, priceMinor: 5000 },
];
const base = { currency: 'SEK', vatRateBp: 2500, maxPages: 50, maxFileMb: 50, bwTiers: tiers, colourTiers: tiers };

describe('PriceListInput', () => {
  it('accepts tiers that cover 1..maxPages exactly', () => {
    expect(PriceListInput.safeParse(base).success).toBe(true);
  });

  it('allows colour to be switched off', () => {
    expect(PriceListInput.safeParse({ ...base, colourTiers: null }).success).toBe(true);
  });

  it('rejects gaps, overlaps and tiers that stop short of the limit', () => {
    const gap = [tiers[0], { ...tiers[1]!, fromPages: 7 }, tiers[2], tiers[3]];
    const overlap = [tiers[0], { ...tiers[1]!, fromPages: 5 }, tiers[2], tiers[3]];
    for (const bwTiers of [gap, overlap, tiers.slice(0, 3)]) {
      expect(PriceListInput.safeParse({ ...base, bwTiers }).success).toBe(false);
    }
  });
});
