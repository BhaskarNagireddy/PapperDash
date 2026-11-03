import type { Tokens } from './types.js';

/**
 * Turns the design system's tokens.json into CSS custom properties.
 * Colours become --color-<name>, type styles --font-<style>-*, and the other families --<name>.
 */
export function toCss(tokens: Tokens): string {
  const lines: string[] = [];
  const theme = tokens.color.themes[0]!.id;
  for (const t of tokens.color.tokens) lines.push(`  --color-${t.name}: ${t.value[theme]};`);
  for (const [family, stack] of Object.entries(tokens.type.families)) lines.push(`  --font-family-${family}: ${stack};`);
  for (const group of tokens.type.groups) {
    for (const s of group.styles) {
      const family = s.family || group.family;
      lines.push(`  --font-${s.name}-family: var(--font-family-${family});`);
      lines.push(`  --font-${s.name}-size: ${s.fontSize};`);
      lines.push(`  --font-${s.name}-line-height: ${s.lineHeight};`);
      lines.push(`  --font-${s.name}-weight: ${s.fontWeight};`);
      lines.push(`  --font-${s.name}-letter-spacing: ${s.letterSpacing};`);
    }
  }
  for (const family of ['spacing', 'radius', 'size'] as const) {
    for (const t of tokens[family].tokens) lines.push(`  --${t.name}: ${t.value};`);
  }
  return `/* PapperDash design tokens — generated from tokens.json by scripts/build.mjs; do not edit. */\n:root {\n${lines.join('\n')}\n}\n`;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
