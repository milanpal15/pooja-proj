/** Test helper: load a sibling .ts module (and its relative .ts imports) as CommonJS; bare imports (axios) use Node's require. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));

function load(abs, cache) {
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (spec) => {
    if (spec.startsWith('.')) return load(path.resolve(path.dirname(abs), `${spec}.ts`), cache);
    if (spec === 'axios') return nodeRequire('axios');
    throw new Error(`test loader: unexpected import ${spec} in ${abs}`);
  };
  new Function('exports', 'module', 'require', out)(mod.exports, mod, req);
  return mod.exports;
}

const shared = new Map(); // one graph per test file, so `ApiError` is one class
export const loadTs = (name) => load(path.join(here, `${name}.ts`), shared);
