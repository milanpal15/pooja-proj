/**
 * Test helper: loads a `.ts` file (and the relative `.ts` files it imports) without a build step.
 * Type-only `@/…` imports are erased by the transpiler; value imports of `@/…` are not supported.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const cache = new Map();

export function loadTs(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (id) => {
    if (id.startsWith('.')) return loadTs(path.resolve(path.dirname(abs), id.endsWith('.ts') ? id : `${id}.ts`));
    throw new Error(`load-ts: unsupported import ${id} in ${abs}`);
  };
  new Function('exports', 'require', 'module', out)(mod.exports, req, mod);
  return mod.exports;
}
