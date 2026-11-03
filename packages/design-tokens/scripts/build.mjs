// Builds dist/tokens.css and dist/index.js from tokens.json. Plain Node, no compiler needed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'));
// The CSS generator lives in src/tokens.ts (tested); Node 22 strips its types when loading it.
const { toCss } = await import(join(root, 'src', 'tokens.ts'));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'tokens.css'), toCss(tokens));
const colors = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value[tokens.color.themes[0].id]]));
writeFileSync(join(root, 'dist', 'index.js'), `// Generated from tokens.json; do not edit.\nexport const colors = ${JSON.stringify(colors, null, 2)};\n`);
writeFileSync(
  join(root, 'dist', 'index.d.ts'),
  `// Generated from tokens.json; do not edit.\nexport declare const colors: { ${Object.keys(colors).map((k) => `readonly ${JSON.stringify(k)}: string`).join('; ')} };\n`,
);
console.log(`Built ${Object.keys(colors).length} colours into dist/tokens.css and dist/index.js`);
