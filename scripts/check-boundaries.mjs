// Fails when a block reaches into another block's internals.
// A block may import another block only through its public entry point: blocks/<name>/index.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';

const BLOCK_ROOTS = ['services/core/src/blocks'];
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const violations = [];
for (const root of BLOCK_ROOTS) {
  const absRoot = resolve(root);
  for (const file of walk(absRoot)) {
    const ownBlock = relative(absRoot, file).split(sep)[0];
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec.startsWith('.')) continue;
      const target = resolve(dirname(file), spec);
      const rel = relative(absRoot, target);
      if (rel.startsWith('..')) continue; // outside blocks/ (platform, contracts)
      const [targetBlock, ...rest] = rel.split(sep);
      if (targetBlock === ownBlock) continue;
      const isPublicEntry = rest.length === 1 && /^index(\.js|\.ts)?$/.test(rest[0]);
      if (!isPublicEntry) violations.push(`${relative(process.cwd(), file)} imports ${spec} (internal to block "${targetBlock}")`);
    }
  }
}

if (violations.length) {
  console.error('Block boundary violations — import other blocks only via their index:\n  ' + violations.join('\n  '));
  process.exit(1);
}
console.log('Block boundaries OK');
