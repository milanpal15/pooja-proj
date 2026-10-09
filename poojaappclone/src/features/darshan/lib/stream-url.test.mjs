/**
 * The live-darshan address as the player reads it.
 *
 *   node --test src/features/darshan/lib/stream-url.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'stream-url.ts'), 'utf8');
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const mod = { exports: {} };
new Function('module', 'exports', outputText)(mod, mod.exports);
const { streamAddress, unwrapEmbed, youTubeId } = mod.exports;

const IFRAME =
  '<iframe width="560" height="315" src="https://www.youtube.com/embed/iD7bdfmqzXE?si=h3h3ZKDbxB_Lnr7A" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';

test('a whole pasted embed snippet is understood', () => {
  const addr = streamAddress(IFRAME);
  assert.equal(addr, 'https://www.youtube.com/embed/iD7bdfmqzXE?si=h3h3ZKDbxB_Lnr7A');
  assert.equal(youTubeId(addr), 'iD7bdfmqzXE');
  assert.equal(unwrapEmbed(`<iframe src='https://www.youtube.com/embed/iD7bdfmqzXE?a=1&amp;b=2'></iframe>`), 'https://www.youtube.com/embed/iD7bdfmqzXE?a=1&b=2');
});

test('every YouTube shape yields the id; other streams do not', () => {
  for (const u of [
    'https://www.youtube.com/watch?v=iD7bdfmqzXE&t=1s',
    'https://youtu.be/iD7bdfmqzXE',
    'https://www.youtube.com/live/iD7bdfmqzXE',
    'https://www.youtube.com/shorts/iD7bdfmqzXE',
    'https://www.youtube-nocookie.com/embed/iD7bdfmqzXE',
  ]) assert.equal(youTubeId(u), 'iD7bdfmqzXE', u);
  assert.equal(youTubeId('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'), null);
});

test('blank is no stream; a plain URL passes through untouched', () => {
  assert.equal(streamAddress(''), undefined);
  assert.equal(streamAddress('   '), undefined);
  assert.equal(streamAddress(undefined), undefined);
  assert.equal(streamAddress('<iframe></iframe>'), undefined);
  assert.equal(streamAddress(' https://x.test/a.m3u8 '), 'https://x.test/a.m3u8');
});
