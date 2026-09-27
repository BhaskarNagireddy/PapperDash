import { describe, expect, it } from 'vitest';
import { selectedPages } from './documents.js';

describe('selectedPages', () => {
  it('selects every page when no range is given', () => {
    expect(selectedPages(undefined, 3)).toEqual({ pages: [1, 2, 3] });
  });

  it('merges overlapping ranges and sorts', () => {
    expect(selectedPages('5, 1-3, 2-4', 10)).toEqual({ pages: [1, 2, 3, 4, 5] });
  });

  it('explains pages that do not exist', () => {
    expect(selectedPages('1-12', 10)).toEqual({ error: 'The document has 10 pages; page 12 does not exist.' });
    expect(selectedPages('3-1', 10)).toHaveProperty('error');
  });
});
