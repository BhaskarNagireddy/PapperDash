import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentsService as DocumentsSweep } from '../src/blocks/documents/index.js';
import { OrdersService } from '../src/blocks/orders/index.js';
import { canConvertOffice, docxWithPages, pdfWithPages, png } from './fixtures.js';
import { readyDocument, signUp, startHarness, upload, type Harness } from './harness.js';

const HOUR = 3600 * 1000;
let h: Harness;
let token: string;
beforeAll(async () => {
  h = await startHarness();
  ({ token } = await signUp(h, 'docs@example.se'));
});
afterAll(() => h.close());

const create = (body: Record<string, unknown>, t = token) => h.http().post('/v1/documents').set('Authorization', `Bearer ${t}`).send(body);

describe('uploading', () => {
  it('registers a file, uploads it directly to storage, and counts its pages', async () => {
    const created = await create({ fileName: 'Thesis.pdf', contentType: 'application/pdf', sizeBytes: 1234 }).expect(201);
    expect(created.body.document).toMatchObject({ status: 'awaiting_upload', fileName: 'Thesis.pdf' });
    expect(created.body.upload).toMatchObject({ maxBytes: 50 * 1024 * 1024 });

    const doc = await upload(h, token, await pdfWithPages(7), 'Thesis.pdf');
    expect(doc).toMatchObject({ status: 'ready', pageCount: 7, rejection: null });
    // Customers are told when their file will be deleted.
    expect(new Date(doc.deleteAfter!).getTime()).toBe(h.clock.now().getTime() + 2 * HOUR);
  });

  it('refuses files over 50 MB and names that do not match the type, before any upload', async () => {
    const big = await create({ fileName: 'big.pdf', contentType: 'application/pdf', sizeBytes: 50 * 1024 * 1024 + 1 }).expect(413);
    expect(big.body.message).toMatch(/up to 50 MB/);
    await create({ fileName: 'photo.png', contentType: 'application/pdf', sizeBytes: 10 }).expect(400);
    const exe = await create({ fileName: 'virus.exe', contentType: 'application/x-msdownload', sizeBytes: 10 }).expect(400);
    expect(exe.body.issues[0].message).toMatch(/PDF, JPG, PNG, Word, Excel or PowerPoint/);
  });

  it('asks the customer to retry when the upload never reached storage', async () => {
    const created = await create({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10 }).expect(201);
    const res = await h.http().post(`/v1/documents/${created.body.document.id}/complete`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(res.body.error).toBe('upload_missing');
  });

  it('keeps each customer\'s files private', async () => {
    const { token: other } = await signUp(h, 'nosy@example.se');
    const id = await readyDocument(h, token);
    await h.http().get(`/v1/documents/${id}`).set('Authorization', `Bearer ${other}`).expect(404);
    await h.http().delete(`/v1/documents/${id}`).set('Authorization', `Bearer ${other}`).expect(404);
    const mine = await h.http().get('/v1/documents').set('Authorization', `Bearer ${other}`).expect(200);
    expect(mine.body.documents).toEqual([]);
  });
});

describe('processing', () => {
  it('converts an image to a one-page printable PDF', async () => {
    const doc = await upload(h, token, png(1200, 800), 'receipt.png', 'image/png');
    expect(doc).toMatchObject({ status: 'ready', pageCount: 1 });
    const stored = [...h.storage.objects.keys()].filter((k) => k.includes(doc.id));
    expect(stored.sort()).toEqual([`print/${doc.id}.pdf`, `source/${doc.id}`]);
  });

  it('checks the content, not the file name', async () => {
    const doc = await upload(h, token, png(10, 10), 'sneaky.pdf', 'application/pdf');
    expect(doc).toMatchObject({ status: 'rejected', rejection: { reason: 'type_mismatch' } });
  });

  it('explains damaged and password-protected PDFs', async () => {
    const corrupt = await upload(h, token, Buffer.from('%PDF-1.7 truncated'));
    expect(corrupt.rejection).toMatchObject({ reason: 'corrupt', message: expect.stringMatching(/Export it again as PDF/) });
    const locked = await upload(h, token, await pdfWithPages(2, { encrypted: true }));
    expect(locked.rejection).toMatchObject({ reason: 'encrypted', message: expect.stringMatching(/password/) });
  });

  // CI installs LibreOffice Writer, so this always runs there; locally it runs when Writer is installed.
  it.runIf(!!process.env.CI || canConvertOffice())(
    'converts a Word document to PDF with LibreOffice and counts the pages',
    async () => {
      const doc = await upload(h, token, docxWithPages(3), 'essay.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(doc).toMatchObject({ status: 'ready', pageCount: 3 });
    },
    180_000,
  );
});

describe('automatic deletion', () => {
  it('deletes unpaid uploads 2 hours after upload, files and name included', async () => {
    const id = await readyDocument(h, token);
    h.clock.advance(2 * HOUR - 1000);
    await h.app.get(DocumentsSweep).sweep();
    expect(h.storage.objects.has(`source/${id}`)).toBe(true);

    h.clock.advance(2000);
    await h.app.get(DocumentsSweep).sweep();
    expect(h.storage.objects.has(`source/${id}`)).toBe(false);
    const doc = await h.http().get(`/v1/documents/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(doc.body).toMatchObject({ status: 'deleted', fileName: '(deleted)', deleteAfter: null });
  });

  it('keeps the file while a paid order is in progress, then deletes it 24 hours after completion', async () => {
    const orders = h.app.get(OrdersService);
    const system = { kind: 'system', block: 'test' } as const;
    const id = await readyDocument(h, token);
    const { body: order } = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send({ documentId: id, fulfilment: 'delivery', settings: {} }).expect(201);
    await orders.awaitPayment(order.id, order.total, system);
    await orders.transition(order.id, 'Paid', system);
    await h.flush();

    // A failed print days later can still be retried: the file is kept while the order is open.
    h.clock.advance(72 * HOUR);
    await h.app.get(DocumentsSweep).sweep();
    expect(h.storage.objects.has(`source/${id}`)).toBe(true);
    await h.http().delete(`/v1/documents/${id}`).set('Authorization', `Bearer ${token}`).expect(409);

    for (const s of ['Queued', 'Printing', 'Printed', 'ReadyForCourier', 'OutForDelivery', 'Delivered', 'Completed'] as const) await orders.transition(order.id, s, system);
    await h.flush();
    h.clock.advance(24 * HOUR - 1000);
    await h.app.get(DocumentsSweep).sweep();
    expect(h.storage.objects.has(`source/${id}`)).toBe(true);
    h.clock.advance(2000);
    await h.app.get(DocumentsSweep).sweep();
    expect(h.storage.objects.has(`source/${id}`)).toBe(false);
  });

  it('lets customers delete their own file straight away when no order needs it', async () => {
    const id = await readyDocument(h, token);
    await h.http().delete(`/v1/documents/${id}`).set('Authorization', `Bearer ${token}`).expect(204);
    expect(h.storage.objects.has(`source/${id}`)).toBe(false);
    const res = await h.http().post('/v1/orders').set('Authorization', `Bearer ${token}`).send({ documentId: id, fulfilment: 'delivery', settings: {} }).expect(404);
    expect(res.body.message).toMatch(/no longer available/);
  });
});
