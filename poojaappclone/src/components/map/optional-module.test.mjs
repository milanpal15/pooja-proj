/** node --test src/components/map/optional-module.test.mjs */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTs } from './load-ts.mjs';

const { loadOptionalModule } = loadTs('optional-module');

test('returns the module when the native half is present', () => {
  const mod = { Map: 1 };
  assert.equal(loadOptionalModule(() => true, () => mod), mod);
});

test('null when the probe says the native module is missing — load is never called', () => {
  let called = false;
  const r = loadOptionalModule(
    () => false,
    () => {
      called = true;
      return {};
    },
  );
  assert.equal(r, null);
  assert.equal(called, false);
});

test('null (not a throw) when require throws, e.g. the native module is absent in an old build', () => {
  const r = loadOptionalModule(
    () => true,
    () => {
      throw new Error("TurboModuleRegistry.getEnforcing(...): 'MLRNMapViewModule' could not be found");
    },
  );
  assert.equal(r, null);
});

test('null when the probe itself throws, or the module is undefined', () => {
  assert.equal(loadOptionalModule(() => { throw new Error('x'); }, () => ({})), null);
  assert.equal(loadOptionalModule(() => true, () => undefined), null);
});
