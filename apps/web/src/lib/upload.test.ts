import { describe, expect, it } from 'vitest';
import { orderInput } from '@/components/print/PrintFlow';
import { formatMoney } from './money';
import { ACCEPT, contentTypeOf } from './upload';

describe('file types', () => {
  it('trusts the browser’s type, and falls back to the extension when it is empty', () => {
    expect(contentTypeOf({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf');
    expect(contentTypeOf({ name: 'Rapport.DOCX', type: '' })).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(contentTypeOf({ name: 'notes.txt', type: 'text/plain' })).toBeUndefined();
  });

  it('lets the file picker offer every type core prints', () => {
    for (const ext of ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx', '.pptx']) expect(ACCEPT).toContain(ext);
  });
});

describe('prices', () => {
  it('reads as Swedes and English readers expect', () => {
    expect(formatMoney({ amountMinor: 1600, currency: 'SEK' }, 'sv').replace(/\s/g, ' ')).toBe('16,00 kr');
    expect(formatMoney({ amountMinor: 1600, currency: 'SEK' }, 'en').replace(/\s/g, ' ')).toBe('SEK 16.00');
  });
});

describe('orderInput (what the order step sends)', () => {
  const base = { copies: 2, someP: false, pageRange: '', duplex: true, fulfilment: 'walk-up' as const, stationId: 'lund-1' };

  it('sends a station for station orders and none for delivery', () => {
    expect(orderInput('doc_1', base)).toEqual({ documentId: 'doc_1', settings: { colour: 'bw', duplex: true, copies: 2, paperSize: 'A4' }, fulfilment: 'walk-up', stationId: 'lund-1' });
    expect(orderInput('doc_1', { ...base, fulfilment: 'delivery', stationId: '' })).not.toHaveProperty('stationId');
  });

  it('waits for a station before pricing a station order', () => {
    expect(orderInput('doc_1', { ...base, stationId: '' })).toBeNull();
  });

  it('sends a page range only when "some pages" is chosen and filled in', () => {
    expect(orderInput('doc_1', { ...base, pageRange: '1-3' })!.settings.pageRange).toBeUndefined();
    expect(orderInput('doc_1', { ...base, someP: true, pageRange: ' 1-3 ' })!.settings.pageRange).toBe('1-3');
    expect(orderInput('doc_1', { ...base, someP: true, pageRange: '' })!.settings.pageRange).toBeUndefined();
  });
});
