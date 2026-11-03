import { describe, expect, it } from 'vitest';
import { localeInPath, localizedPath, switchLocale } from './config';
import { en } from './en';
import { sv } from './sv';

const leaves = (o: object, prefix = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));

describe('translations', () => {
  it('Swedish has every English key and no empty text', () => {
    // The type already enforces the keys; this also catches empty strings and keys added only to Swedish.
    expect(leaves(sv).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
    for (const [key, text] of [...leaves(en), ...leaves(sv)]) expect(text.trim(), key).not.toBe('');
  });
});

describe('locale routing', () => {
  it('reads the language from the path', () => {
    expect(localeInPath('/en/prices')).toBe('en');
    expect(localeInPath('/sv')).toBe('sv');
    expect(localeInPath('/de/prices')).toBeUndefined();
    expect(localeInPath('/')).toBeUndefined();
  });

  it('sends visitors without a language to Swedish, or to the language they chose before', () => {
    expect(localizedPath('/', undefined)).toBe('/sv');
    expect(localizedPath('/prices', undefined)).toBe('/sv/prices');
    expect(localizedPath('/prices', 'en')).toBe('/en/prices');
    expect(localizedPath('/prices', 'xx')).toBe('/sv/prices');
  });

  it('switches language on the same page', () => {
    expect(switchLocale('/sv/prices', 'en')).toBe('/en/prices');
    expect(switchLocale('/en', 'sv')).toBe('/sv');
  });
});
