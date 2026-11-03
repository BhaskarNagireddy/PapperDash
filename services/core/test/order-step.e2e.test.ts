import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityService } from '../src/blocks/identity/identity.service.js';
import { ObjectStorage } from '../src/blocks/documents/index.js';
import { pdfWithPages } from './fixtures.js';
import { readyDocument, signUp, startHarness, STATION, type Harness } from './harness.js';

let h: Harness;
let closed: Harness;
beforeAll(async () => {
  h = await startHarness();
  closed = await startHarness({ config: { orderingEnabled: false } });
});
afterAll(async () => {
  await h.close();
  await closed.close();
});

const bearer = (token: string) => `Bearer ${token}`;
const settings = (extra: Record<string, unknown> = {}) => ({ colour: 'bw', copies: 1, ...extra });

describe('stations directory', () => {
  it('lists only open stations, publicly', async () => {
    const res = await h.http().get('/v1/stations').expect(200);
    expect(res.body.stations).toEqual([{ id: STATION.id, name: 'Lund simulator', address: 'Testgatan 1', city: 'Lund', lockers: true }]);
  });

  it('only admins add or change stations, with a valid ID', async () => {
    const { token, user } = await signUp(h, 'stations-admin@example.se');
    const station = { name: 'Malmö C', address: 'Centralplan 10', city: 'Malmö', lockers: false, active: true };
    await h.http().put('/v1/admin/stations/malmo-c-1').set('Authorization', bearer(token)).send(station).expect(403);
    await h.http().put('/v1/admin/stations/malmo-c-1').send(station).expect(401);
    await h.app.get(IdentityService).setRoles(user.id, ['admin']);
    await h.http().put('/v1/admin/stations/Malmö C').set('Authorization', bearer(token)).send(station).expect(400);
    await h.http().put('/v1/admin/stations/malmo-c-1').set('Authorization', bearer(token)).send(station).expect(200);
    await h.http().put('/v1/admin/stations/closed-1').set('Authorization', bearer(token)).send({ ...station, active: false }).expect(200);
    const ids = (await h.http().get('/v1/stations').expect(200)).body.stations.map((s: { id: string }) => s.id);
    expect(ids).toEqual([STATION.id, 'malmo-c-1']);
  });
});

describe('price at the order step', () => {
  it('prices the uploaded document from its real page count, page range and copies', async () => {
    const { token } = await signUp(h, 'quote@example.se');
    const doc = await readyDocument(h, token, 12);
    const quote = (s: Record<string, unknown>) =>
      h.http().post('/v1/orders/quote').set('Authorization', bearer(token)).send({ documentId: doc, settings: settings(s), fulfilment: 'walk-up', stationId: STATION.id });

    // 12 pages -> the 6-15 tier, 16 kr including 3,20 kr VAT.
    const all = await quote({}).expect(200);
    expect(all.body).toMatchObject({ pages: 12, documentPages: 12, quote: { printedPages: 12, total: { amountMinor: 1600, currency: 'SEK' }, vat: { amountMinor: 320 } } });
    // Pages 1-3 x 2 copies = 6 printed pages -> still 16 kr; pages 1-2 = 2 -> the 1-5 tier, 10 kr.
    expect((await quote({ pageRange: '1-3', copies: 2 }).expect(200)).body.quote.printedPages).toBe(6);
    expect((await quote({ pageRange: '1-2' }).expect(200)).body.quote.total.amountMinor).toBe(1000);
    // 12 pages x 5 copies = 60 > the 50-page order limit.
    expect((await quote({ copies: 5 }).expect(422)).body.error).toBe('too_many_pages');
    expect((await quote({ pageRange: '10-14' }).expect(400)).body.error).toBe('invalid_page_range');
    expect((await quote({ colour: 'colour' }).expect(422)).body.error).toBe('colour_unavailable');
  });

  it('matches the price the order is then created with', async () => {
    const { token } = await signUp(h, 'same-price@example.se');
    const doc = await readyDocument(h, token, 7);
    const body = { documentId: doc, settings: settings({ copies: 3 }), fulfilment: 'locker', stationId: STATION.id };
    const quoted = await h.http().post('/v1/orders/quote').set('Authorization', bearer(token)).send(body).expect(200);
    const order = await h.http().post('/v1/orders').set('Authorization', bearer(token)).send(body).expect(201);
    expect(order.body.total).toEqual(quoted.body.quote.total);
  });

  it('works while ordering is closed and before the email is confirmed, so customers see the price early', async () => {
    const { token } = await signUp(closed, 'early-price@example.se', { verify: false });
    const doc = await readyDocument(closed, token, 3);
    const body = { documentId: doc, settings: settings(), fulfilment: 'delivery' };
    const res = await closed.http().post('/v1/orders/quote').set('Authorization', bearer(token)).send(body).expect(200);
    expect(res.body.quote.total.amountMinor).toBe(1000);
    expect((await closed.http().post('/v1/orders').set('Authorization', bearer(token)).send(body).expect(503)).body.error).toBe('ordering_closed');
  });

  it('only prices the customer’s own documents, at open stations that suit the pick-up choice', async () => {
    const owner = await signUp(h, 'owner@example.se');
    const other = await signUp(h, 'other@example.se');
    const doc = await readyDocument(h, owner.token, 3);
    await h.http().post('/v1/orders/quote').set('Authorization', bearer(other.token)).send({ documentId: doc, settings: settings(), fulfilment: 'delivery' }).expect(404);
    await h.http().post('/v1/orders/quote').send({ documentId: doc, settings: settings(), fulfilment: 'delivery' }).expect(401);

    const at = (stationId: string, fulfilment: string) =>
      h.http().post('/v1/orders/quote').set('Authorization', bearer(owner.token)).send({ documentId: doc, settings: settings(), fulfilment, stationId });
    expect((await at('nowhere-1', 'walk-up').expect(422)).body.error).toBe('station_unavailable');
    // malmo-c-1 was added above without lockers.
    expect((await at('malmo-c-1', 'locker').expect(422)).body.error).toBe('no_lockers');
    await at('malmo-c-1', 'walk-up').expect(200);
  });
});

describe('uploading without S3 (development and CI)', () => {
  it('takes the file like a presigned POST would, only for the customer’s own pending upload', async () => {
    const { token } = await signUp(h, 'dev-upload@example.se');
    const other = await signUp(h, 'dev-upload-other@example.se');
    const file = await pdfWithPages(4);
    const created = await h.http().post('/v1/documents').set('Authorization', bearer(token)).send({ fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: file.length }).expect(201);
    const { url, fields } = created.body.upload as { url: string; fields: Record<string, string> };
    expect(url).toBe('/v1/documents/dev-upload');

    const post = (auth: string, f: Record<string, string>) => {
      const req = h.http().post(url).set('Authorization', auth);
      for (const [k, v] of Object.entries(f)) req.field(k, v);
      return req.attach('file', file, 'notes.pdf');
    };
    await post(bearer(other.token), fields).expect(404);
    await post(bearer(token), { ...fields, key: 'source/doc_someone_else' }).expect(404);
    await post(bearer(token), { ...fields, 'Content-Type': 'image/png' }).expect(404);
    await post(bearer(token), fields).expect(204);

    await h.http().post(`/v1/documents/${created.body.document.id}/complete`).set('Authorization', bearer(token)).expect(200);
    await h.flush();
    const doc = await h.http().get(`/v1/documents/${created.body.document.id}`).set('Authorization', bearer(token)).expect(200);
    expect(doc.body).toMatchObject({ status: 'ready', pageCount: 4 });
    // Once uploaded, the same key cannot be written again.
    await post(bearer(token), fields).expect(404);
  });

  it('does not exist when real storage is configured', async () => {
    class FakeS3 extends ObjectStorage {
      createUpload = async () => ({ url: 'https://bucket.example', fields: {}, expiresAt: '', maxBytes: 1 });
      size = async () => null;
      get = async () => Buffer.alloc(0);
      put = async () => undefined;
      delete = async () => undefined;
      signedGetUrl = async () => '';
    }
    const s3 = await startHarness({ overrides: [[ObjectStorage, new FakeS3()]] });
    try {
      const { token } = await signUp(s3, 's3@example.se');
      await s3.http().post('/v1/documents/dev-upload').set('Authorization', bearer(token)).field('key', 'source/x').attach('file', Buffer.from('%PDF'), 'x.pdf').expect(404);
    } finally {
      await s3.close();
    }
  });
});
