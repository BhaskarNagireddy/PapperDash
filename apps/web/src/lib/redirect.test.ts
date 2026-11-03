import { describe, expect, it } from 'vitest';
import { safeNext } from './redirect';

describe('safeNext (where login sends the customer)', () => {
  it('keeps a path on this site in the same language', () => {
    expect(safeNext('/sv/account', 'sv')).toBe('/sv/account');
    expect(safeNext('/en/account?tab=orders', 'en')).toBe('/en/account?tab=orders');
  });

  it.each([
    ['nothing', null],
    ['another website', 'https://evil.example/sv/account'],
    ['a protocol-relative URL', '//evil.example/sv/'],
    ['a backslash trick', '/sv/\\evil.example'],
    ['the other language', '/en/account'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('falls back to the account page for %s', (_, next) => {
    expect(safeNext(next, 'sv')).toBe('/sv/account');
  });
});
