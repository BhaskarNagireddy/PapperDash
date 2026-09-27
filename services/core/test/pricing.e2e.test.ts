import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signUp, startHarness, type Harness } from './harness.js';
import { IdentityService } from '../src/blocks/identity/identity.service.js';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());

const quote = (body: Record<string, unknown>) => h.http().post('/v1/pricing/quote').send({ fulfilment: 'delivery', ...body });

describe('launch price list (SE)', () => {
  it('prices each tier for the whole order, VAT included', async () => {
    const cases: [number, number][] = [
      [1, 1000],
      [5, 1000],
      [6, 1600],
      [15, 1600],
      [16, 2500],
      [25, 2500],
      [26, 5000],
      [50, 5000],
    ];
    for (const [pages, expected] of cases) {
      const res = await quote({ pages }).expect(200);
      expect(res.body.total, `${pages} pages`).toEqual({ amountMinor: expected, currency: 'SEK' });
    }
    const res = await quote({ pages: 5 }).expect(200);
    expect(res.body.vat).toEqual({ amountMinor: 200, currency: 'SEK' }); // 10 kr incl. 25 % VAT = 2 kr VAT
  });

  it('counts copies: 4 pages x 3 copies = 12 printed pages', async () => {
    const res = await quote({ pages: 4, copies: 3 }).expect(200);
    expect(res.body).toMatchObject({ printedPages: 12, total: { amountMinor: 1600 } });
  });

  it('refuses orders over 50 printed pages with a clear next step', async () => {
    const res = await quote({ pages: 20, copies: 3 }).expect(422);
    expect(res.body).toMatchObject({ error: 'too_many_pages', maxPages: 50 });
    expect(res.body.message).toMatch(/up to 50 pages.*60/);
  });

  it('exposes the current price table publicly, including the 50 MB upload limit', async () => {
    const res = await h.http().get('/v1/pricing').expect(200);
    expect(res.body).toMatchObject({ market: 'SE', currency: 'SEK', maxPages: 50, maxFileMb: 50, colourTiers: null });
    expect(res.body.bwTiers).toHaveLength(4);
    expect(res.body).not.toHaveProperty('deliveryFeeMinor');
  });

  it('prints black and white only in the prototype', async () => {
    const res = await quote({ pages: 3, colour: 'colour' }).expect(422);
    expect(res.body.error).toBe('colour_unavailable');
  });

  it('never adds a delivery fee: the delivery partner charges it', async () => {
    const res = await quote({ pages: 3, fulfilment: 'delivery' }).expect(200);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.total.amountMinor).toBe(1000);
  });
});

describe('admin price changes', () => {
  const tiers = [
    { fromPages: 1, toPages: 10, priceMinor: 1200 },
    { fromPages: 11, toPages: 50, priceMinor: 4000 },
  ];
  const list = { currency: 'SEK', vatRateBp: 2500, maxPages: 50, maxFileMb: 50, bwTiers: tiers, colourTiers: tiers.map((t) => ({ ...t, priceMinor: t.priceMinor * 2 })) };

  it('only admins can change prices', async () => {
    const { token } = await signUp(h, 'customer@example.se');
    await h.http().put('/v1/admin/pricing/SE').set('Authorization', `Bearer ${token}`).send(list).expect(403);
    await h.http().put('/v1/admin/pricing/SE').send(list).expect(401);
  });

  it('publishes a new list without code changes and keeps the history', async () => {
    const { token, user } = await signUp(h, 'admin@example.se');
    await h.app.get(IdentityService).setRoles(user.id, ['admin']);
    const bad = await h.http().put('/v1/admin/pricing/SE').set('Authorization', `Bearer ${token}`).send({ ...list, bwTiers: tiers.slice(0, 1) }).expect(400);
    expect(bad.body.issues[0].path).toBe('bwTiers');

    h.clock.advance(1000);
    await h.http().put('/v1/admin/pricing/SE').set('Authorization', `Bearer ${token}`).send(list).expect(200);
    const colour = await quote({ pages: 12, colour: 'colour' }).expect(200);
    expect(colour.body.total.amountMinor).toBe(8000);
    const bw = await quote({ pages: 12, fulfilment: 'locker' }).expect(200);
    expect(bw.body.total.amountMinor).toBe(4000);

    const history = await h.http().get('/v1/admin/pricing/SE/history').set('Authorization', `Bearer ${token}`).expect(200);
    expect(history.body.priceLists.map((p: { id: string }) => p.id).slice(-2)).toEqual(['prl_seed_se_bw_only', 'prl_seed_se_launch']);
  });
});
