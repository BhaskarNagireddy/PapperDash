import { describe, expect, it } from 'vitest';
import { isStationId } from './stations.js';

describe('isStationId', () => {
  it.each(['lund-central-1', 'malmo2', 'a'])('accepts %s', (id) => expect(isStationId(id)).toBe(true));
  it.each(['', 'Lund-1', 'lund--1', '-lund', 'lund-', 'lund c', 'lund_1', 'malmö-1', 'a'.repeat(65)])('refuses %j', (id) => expect(isStationId(id)).toBe(false));
  it('answers quickly for long hostile input', () => {
    const start = performance.now();
    isStationId(`${'a-'.repeat(100_000)}!`);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
