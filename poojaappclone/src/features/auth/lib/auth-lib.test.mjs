/**
 * Pure sign-in logic: DOB maths, profile validation order, phone
 * normalisation, step precedence.
 *
 *   node --test src/features/auth/lib/auth-lib.test.mjs
 *
 * Transpiles the .ts with the project's TypeScript, like i18n.test.mjs.
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

function load(file, cache = new Map()) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const out = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const req = (spec) => {
    if (!spec.startsWith('.')) throw new Error(`unexpected import ${spec} in ${abs}`);
    return load(path.resolve(path.dirname(abs), `${spec}.ts`), cache);
  };
  new Function('exports', 'require', 'module', out)(mod.exports, req, mod);
  return mod.exports;
}

const { isRealDate, splitDob, joinDob } = load(path.join(here, 'dob.ts'));
const { validateProfile } = load(path.join(here, 'validate-profile.ts'));
const { normalisePhone, isValidPhone } = load(path.join(here, 'phone.ts'));
const { deriveStep } = load(path.join(here, 'step.ts'));

test('isRealDate: month lengths, leap years, floor year', () => {
  assert.equal(isRealDate('2025', '02', '28'), true);
  assert.equal(isRealDate('2025', '02', '29'), false);
  assert.equal(isRealDate('2024', '02', '29'), true);
  assert.equal(isRealDate('2025', '04', '31'), false);
  assert.equal(isRealDate('2025', '13', '01'), false);
  assert.equal(isRealDate('2025', '00', '10'), false);
  assert.equal(isRealDate('2025', '01', '00'), false);
  assert.equal(isRealDate('1899', '12', '31'), false);
});

test('splitDob / joinDob round-trip and incomplete input', () => {
  assert.deepEqual(splitDob('1990-07-04'), { d: '04', m: '07', y: '1990' });
  assert.deepEqual(splitDob('garbage'), { d: '', m: '', y: '' });
  assert.equal(joinDob({ d: '04', m: '07', y: '1990' }), '1990-07-04');
  assert.equal(joinDob({ d: '4', m: '07', y: '1990' }), '');
  assert.equal(joinDob({ d: '04', m: '07', y: '199' }), '');
  assert.equal(joinDob({ d: '31', m: '02', y: '1990' }), '');
});

const ok = { name: 'Asha', gender: 'female', dob: '1990-07-04', email: '', needsEmail: false };

test('validateProfile: valid profile passes', () => {
  assert.equal(validateProfile(ok, '2026-01-01'), null);
});

test('validateProfile: order is name, gender, dob shape, dob real, dob future, email', () => {
  const all = { name: ' ', gender: null, dob: '', email: 'x', needsEmail: true };
  assert.deepEqual(validateProfile(all, '2026-01-01'), { field: 'name', key: 'err_name' });
  assert.deepEqual(validateProfile({ ...all, name: 'A' }, '2026-01-01'), { field: 'gender', key: 'err_gender' });
  assert.deepEqual(validateProfile({ ...all, name: 'A', gender: 'male' }, '2026-01-01'), { field: 'dob', key: 'err_dob' });
  assert.deepEqual(
    validateProfile({ ...all, name: 'A', gender: 'male', dob: '2025-02-31' }, '2026-01-01'),
    { field: 'dob', key: 'err_dob' },
  );
  assert.deepEqual(
    validateProfile({ ...all, name: 'A', gender: 'male', dob: '2027-01-01' }, '2026-01-01'),
    { field: 'dob', key: 'err_dob_future' },
  );
  assert.deepEqual(
    validateProfile({ ...all, name: 'A', gender: 'male', dob: '1990-01-01' }, '2026-01-01'),
    { field: 'email', key: 'err_email' },
  );
});

test('validateProfile: email only checked when needed; today is allowed', () => {
  assert.equal(validateProfile({ ...ok, email: 'nonsense' }, '2026-01-01'), null);
  assert.equal(validateProfile({ ...ok, dob: '2026-01-01' }, '2026-01-01'), null);
  assert.equal(validateProfile({ ...ok, needsEmail: true, email: ' a@b.co ' }, '2026-01-01'), null);
  assert.equal(validateProfile({ ...ok, needsEmail: true, email: 'a@b' }, '2026-01-01').key, 'err_email');
});

test('normalisePhone: typed, pasted and autofilled forms', () => {
  assert.equal(normalisePhone('9876543210'), '9876543210');
  assert.equal(normalisePhone('+91 98765 43210'), '9876543210');
  assert.equal(normalisePhone('919876543210'), '9876543210');
  assert.equal(normalisePhone('98-765 abc 43210999'), '9876543210');
  assert.equal(normalisePhone('9123456789'), '9123456789'); // starts with 91 but is only ten digits
  assert.equal(normalisePhone(''), '');
});

test('isValidPhone needs exactly ten digits', () => {
  assert.equal(isValidPhone('9876543210'), true);
  assert.equal(isValidPhone('987654321'), false);
  assert.equal(isValidPhone(''), false);
});

test('deriveStep precedence: needsProfile > authError > phone flag > local', () => {
  const base = { needsProfile: false, authError: null, phoneEnabled: true, localStep: 'otp' };
  assert.equal(deriveStep(base), 'otp');
  assert.equal(deriveStep({ ...base, authError: 'err_blocked' }), 'select');
  assert.equal(deriveStep({ ...base, needsProfile: true, authError: 'err_blocked' }), 'profile');
  assert.equal(deriveStep({ ...base, phoneEnabled: false }), 'select');
  assert.equal(deriveStep({ ...base, phoneEnabled: false, localStep: 'entry' }), 'select');
  assert.equal(deriveStep({ ...base, phoneEnabled: false, localStep: 'profile' }), 'profile');
  assert.equal(deriveStep({ ...base, phoneEnabled: false, needsProfile: true }), 'profile');
});
