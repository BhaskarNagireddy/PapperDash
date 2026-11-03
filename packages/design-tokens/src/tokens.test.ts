import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, toCss } from './tokens.js';
import type { Tokens } from './types.js';

const tokens: Tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));
const color = (name: string) => tokens.color.tokens.find((t) => t.name === name)!.value.light!;

describe('tokens.css', () => {
  const css = toCss(tokens);
  it('emits every colour, type style, spacing, radius and size token', () => {
    for (const t of tokens.color.tokens) expect(css).toContain(`--color-${t.name}: ${t.value.light};`);
    for (const s of tokens.type.groups.flatMap((g) => g.styles)) expect(css).toContain(`--font-${s.name}-size: ${s.fontSize};`);
    for (const f of ['spacing', 'radius', 'size'] as const) for (const t of tokens[f].tokens) expect(css).toContain(`--${t.name}: ${t.value};`);
  });
});

// The design system's usage notes promise these contrasts (WCAG 2.2 AA). If a token changes, these fail first.
describe('accessible contrast, as the design system promises', () => {
  const surfaces = ['paper', 'card', 'dash-soft'];
  it.each(['ink', 'ink-muted', 'info', 'danger'])('%s text is at least 4.5:1 on every surface it is used on', (text) => {
    for (const s of surfaces) expect(contrastRatio(color(text), color(s)), `${text} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it('ink text is readable on the yellow dash fill, and paper text on the ink button', () => {
    expect(contrastRatio(color('ink'), color('dash'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color('paper'), color('ink'))).toBeGreaterThanOrEqual(4.5);
  });
  it('control borders (line) reach 3:1 on paper; the dash is never usable as text on paper', () => {
    expect(contrastRatio(color('line'), color('paper'))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color('dash'), color('paper'))).toBeLessThan(3);
  });
});
