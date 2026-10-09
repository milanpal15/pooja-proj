import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { User } from '../../models.js';
import { startApp } from '../_harness.mjs';
import * as calls from '../calls/index.js';
import * as payouts from '../payouts/index.js';
import * as wallet from '../wallet/index.js';
import { Astrologer } from './astrologer.model.js';
import * as astrologers from './index.js';
import { claimAstrologer } from './claim.js';

let app;
let api;
const form = (o = {}) => ({ name: 'Acharya Rao', ratePerMin: 12, signInEmail: 'Rao@Example.com', specialities: 'Vedic, Tarot', languages: ['Hindi', 'English'], ...o });
const mkUser = (uid, extra = {}) => User.create({ uid, contact: extra.contact ?? uid, ...extra });

before(async () => {
  app = await startApp('calls_test_astrologers', [wallet, astrologers, calls, payouts]);
  api = app.api;
  await calls.seed();
});
after(async () => app.close());

test('create: normalises identifiers, defaults share from settings, starts invited and offline', async () => {
  const r = await api('POST', '/admin/astrologers', { body: form({ signInPhone: '+91 98765-43210' }) });
  assert.equal(r.status, 201);
  const a = r.body.astrologer;
  assert.equal(a.signInEmail, 'rao@example.com');
  assert.equal(a.signInPhone, '+919876543210');
  assert.equal(a.status, 'invited');
  assert.equal(a.signedIn, false);
  assert.equal(a.platformSharePct, 30);
  assert.deepEqual(a.specialities, ['Vedic', 'Tarot']);
  assert.equal(a.presence, 'offline');
  assert.equal(a.ratingAvg, undefined);
});

test('validation: needs a name, a whole-coin rate and at least one sign-in identifier', async () => {
  assert.equal((await api('POST', '/admin/astrologers', { body: { ratePerMin: 5, signInEmail: 'a@b.co' } })).body.code, 'name_required');
  assert.equal((await api('POST', '/admin/astrologers', { body: { name: 'x', ratePerMin: 0, signInEmail: 'a@b.co' } })).body.code, 'bad_rate');
  assert.equal((await api('POST', '/admin/astrologers', { body: { name: 'x', ratePerMin: 5 } })).body.code, 'identifier_required');
  assert.equal((await api('POST', '/admin/astrologers', { body: { name: 'x', ratePerMin: 5, signInPhone: '98765' } })).body.code, 'bad_phone');
  assert.equal((await api('POST', '/admin/astrologers', { body: { name: 'x', ratePerMin: 5, signInEmail: 'nope' } })).body.code, 'bad_email');
});

test('a duplicate sign-in identifier is rejected on create and on update', async () => {
  const dupEmail = await api('POST', '/admin/astrologers', { body: form({ name: 'Other', signInEmail: 'RAO@example.com' }) });
  assert.equal(dupEmail.status, 409);
  assert.equal(dupEmail.body.code, 'duplicate_identifier');
  const dupPhone = await api('POST', '/admin/astrologers', { body: form({ name: 'Other', signInEmail: 'o@example.com', signInPhone: '+919876543210' }) });
  assert.equal(dupPhone.status, 409);

  const other = await api('POST', '/admin/astrologers', { body: form({ name: 'Other', signInEmail: 'other@example.com' }) });
  const clash = await api('PUT', `/admin/astrologers/${other.body.astrologer.id}`, { body: { signInEmail: 'rao@example.com' } });
  assert.equal(clash.status, 409);
  // two rows with NO phone must not collide on the sparse index
  assert.equal((await Astrologer.countDocuments({ signInPhone: { $exists: false } })), 1);
  const third = await api('POST', '/admin/astrologers', { body: form({ name: 'Third', signInEmail: 'third@example.com' }) });
  assert.equal(third.status, 201);
});

test('update, list, 404 and delete', async () => {
  const list = await api('GET', '/admin/astrologers');
  const rao = list.body.astrologers.find((a) => a.name === 'Acharya Rao');
  const up = await api('PUT', `/admin/astrologers/${rao.id}`, { body: { ratePerMin: 20, bio: 'Hi' } });
  assert.equal(up.body.astrologer.ratePerMin, 20);
  assert.equal(up.body.astrologer.signInEmail, 'rao@example.com', 'untouched fields stay');
  assert.equal((await api('PUT', '/admin/astrologers/nope', { body: {} })).status, 404);
  assert.equal((await api('PUT', `/admin/astrologers/${rao.id}`, { body: { signInEmail: '', signInPhone: '' } })).status, 400, 'cannot remove every identifier');
  const del = await api('DELETE', `/admin/astrologers/${list.body.astrologers.find((a) => a.name === 'Third').id}`);
  assert.equal(del.body.ok, true);
});

test('sign-in claim: a verified e-mail claims the invite and completes the profile', async () => {
  const user = await mkUser('g1', { contact: 'rao@example.com', email: 'rao@example.com', emailVerified: true });
  const out = await claimAstrologer({ uid: 'g1', email: 'rao@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } }, user);
  assert.equal(out.astrologer.name, 'Acharya Rao');
  assert.equal(out.user.role, 'astrologer');
  assert.equal(out.user.name, 'Acharya Rao', 'name copied from the astrologer when blank');
  const a = await Astrologer.findOne({ uid: 'g1' });
  assert.equal(a.status, 'active');
  assert.ok(a.lastSignInAt);
  // Signing in again keeps it, and the role endpoints now open.
  const again = await claimAstrologer({ uid: 'g1', email: 'rao@example.com', email_verified: true }, out.user);
  assert.equal(again.user.role, 'astrologer');
  assert.equal((await api('GET', '/astrologer/me', { uid: 'g1' })).status, 200);
});

test('sign-in claim: a user-typed (unverified) e-mail can NOT claim an invite', async () => {
  await api('POST', '/admin/astrologers', { body: form({ name: 'Eve', signInEmail: 'eve@example.com' }) });
  const user = await mkUser('ph1', { contact: '+911111111111', email: 'eve@example.com', emailVerified: false, name: 'Someone' });
  // a phone sign-in token has no email at all…
  assert.equal((await claimAstrologer({ uid: 'ph1', phone_number: '+911111111111' }, user)).astrologer, null);
  // …and even a token carrying the address without verification is not enough
  const r = await claimAstrologer({ uid: 'ph1', email: 'eve@example.com', email_verified: false }, user);
  assert.equal(r.astrologer, null);
  assert.equal(r.user.role, 'devotee');
  assert.equal((await Astrologer.findOne({ name: 'Eve' })).uid, undefined);
  assert.equal((await api('GET', '/astrologer/me', { uid: 'ph1' })).status, 403);
});

test('sign-in claim: matches by phone, keeps an existing devotee name', async () => {
  await api('POST', '/admin/astrologers', { body: { name: 'Meera Devi', ratePerMin: 8, signInPhone: '+919000000001' } });
  const user = await mkUser('ph2', { contact: '+919000000001', name: 'Meera', phone: '+919000000001' });
  const r = await claimAstrologer({ uid: 'ph2', phone_number: '+919000000001' }, user);
  assert.equal(r.astrologer.name, 'Meera Devi');
  assert.equal(r.user.role, 'astrologer');
  assert.equal(r.user.name, 'Meera', 'a name the devotee already set is not overwritten');
});

test('one invite is claimed once: a second account with the same verified identity does not take it over', async () => {
  const other = await mkUser('ph3', { contact: 'ph3' });
  const r = await claimAstrologer({ uid: 'ph3', phone_number: '+919000000001' }, other);
  assert.equal(r.astrologer, null);
});

test('suspended => devotee on next sync, and no role endpoints; reactivate restores', async () => {
  const a = await Astrologer.findOne({ uid: 'g1' });
  const s = await api('POST', `/admin/astrologers/${a._id}/suspend`);
  assert.equal(s.body.astrologer.status, 'suspended');
  const user = await User.findOne({ uid: 'g1' });
  assert.equal(user.role, 'devotee');
  const r = await claimAstrologer({ uid: 'g1', email: 'rao@example.com', email_verified: true }, user);
  assert.equal(r.astrologer, null);
  assert.equal(r.user.role, 'devotee');
  assert.equal((await api('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: true } })).status, 403);
  await api('POST', `/admin/astrologers/${a._id}/reactivate`);
  assert.equal((await api('GET', '/astrologer/me', { uid: 'g1' })).status, 200);
  assert.equal((await User.findOne({ uid: 'g1' })).role, 'astrologer');
});

test('changing the sign-in identifier unlinks the old account and re-opens the invite', async () => {
  const a = await Astrologer.findOne({ uid: 'ph2' });
  const r = await api('PUT', `/admin/astrologers/${a._id}`, { body: { signInPhone: '+919000000002' } });
  assert.equal(r.body.astrologer.status, 'invited');
  assert.equal(r.body.astrologer.signedIn, false);
  assert.equal((await User.findOne({ uid: 'ph2' })).role, 'devotee');
  assert.equal((await api('GET', '/astrologer/me', { uid: 'ph2' })).status, 403);
});

test('presence: online/offline, heartbeat, busy cannot be forced, public list is derived from freshness', async () => {
  assert.equal((await api('PUT', '/astrologer/me/presence', { uid: 'g1', body: { presence: 'busy' } })).status, 400);
  const on = await api('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: true } });
  assert.equal(on.body.presence, 'online');
  let pub = await api('GET', '/astrologers');
  assert.deepEqual(pub.body.astrologers.map((x) => [x.name, x.presence]), [['Acharya Rao', 'online']]);
  assert.ok(!('uid' in pub.body.astrologers[0]) && !('signInEmail' in pub.body.astrologers[0]));

  await Astrologer.updateOne({ uid: 'g1' }, { $set: { lastSeenAt: new Date(Date.now() - 60_000) } });
  pub = await api('GET', '/astrologers');
  assert.equal(pub.body.astrologers[0].presence, 'offline', 'stale heartbeat reads offline');
  assert.equal((await api('POST', '/astrologer/me/heartbeat', { uid: 'g1' })).body.ok, true);
  assert.equal((await api('GET', '/astrologers')).body.astrologers[0].presence, 'online');

  assert.equal((await api('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: false } })).body.presence, 'offline');
  // unlisted astrologers vanish from the public list
  await api('PUT', `/admin/astrologers/${(await Astrologer.findOne({ uid: 'g1' }))._id}`, { body: { listed: false } });
  assert.equal((await api('GET', '/astrologers')).body.astrologers.length, 0);
});

test('going offline while on a call is refused with 409', async () => {
  const a = await Astrologer.findOne({ uid: 'g1' });
  await Astrologer.updateOne({ _id: a._id }, { $set: { listed: true } });
  await api('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: true } });
  await wallet.walletService.credit({ uid: 'dv', amount: 100, type: 'bonus', idempotencyKey: 'dv-fund' });
  const c = await api('POST', '/calls', { uid: 'dv', body: { astrologerId: String(a._id), requestId: 'z1' } });
  assert.equal(c.status, 201);
  await api('POST', `/calls/${c.body.call.id}/accept`, { uid: 'g1' });
  const off = await api('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: false } });
  assert.equal(off.status, 409);
  const me = await api('GET', '/astrologer/me/calls', { uid: 'g1' });
  assert.equal(me.body.calls.length, 1);
  assert.ok(me.body.calls[0].earnedPaise > 0);
  assert.equal(me.body.calls[0].coins, undefined, 'an astrologer is not shown what the devotee paid');
});
