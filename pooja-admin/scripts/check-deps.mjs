#!/usr/bin/env node
/**
 * Dependency-direction check for the dashboard (DESIGN.md §2, §12 rule 2).
 * No dependencies: it reads the relative imports under src/client and fails
 * the build when one points the wrong way.
 *
 *   ui/ and lib/       may not import features/ or app/   (shared never imports a feature)
 *   features/<x>/      may not import app/
 *   features/<x>/      may import features/<y>/ only through its index.js
 *                      (never reach into another feature's internals)
 *
 * Run by `npm run build` (and so by CI); `npm run check:deps` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/client');
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jsx?|mjs)$/.test(e.name)) yield p;
  }
}

/** The first segment under src/client, and for features the feature's name. */
function zone(abs) {
  const parts = path.relative(root, abs).split(path.sep);
  return { top: parts[0], feature: parts[0] === 'features' ? parts[1] : null, rest: parts.slice(2).join('/') };
}

const problems = [];
for (const file of walk(root)) {
  const from = zone(file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT)) {
    const spec = m[1] || m[2] || m[3];
    if (!spec || !spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!target.startsWith(root)) continue;
    const to = zone(target);
    const where = `${path.relative(root, file)} -> ${spec}`;

    if ((from.top === 'ui' || from.top === 'lib') && (to.top === 'features' || to.top === 'app')) {
      problems.push(`${where}\n    shared code (${from.top}/) must not import ${to.top}/`);
    } else if (from.top === 'features' && to.top === 'app') {
      problems.push(`${where}\n    a feature must not import app/ (the shell imports features, not the reverse)`);
    } else if (from.top === 'features' && to.top === 'features' && to.feature !== from.feature) {
      const viaIndex = to.rest === '' || /^index(\.jsx?)?$/.test(to.rest);
      if (!viaIndex) problems.push(`${where}\n    reaches into features/${to.feature}/ — import its index.js instead`);
    }
  }
}

if (problems.length) {
  console.error(`check-deps: ${problems.length} dependency-direction violation(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('check-deps: ok');
