// Astrologers: the dashboard CRUD and its masking, the invite CLAIM (the internal endpoints identity calls at sign-in), presence, the astrologer's own
// routes. Ported from pooja-api/src/modules/astrologers/astrologers.test.mjs; the claim is exercised through its HTTP shape (issuer `identity` only).
// Run: TEST_MONGODB_URI=mongodb://127.0.0.1:27271/x node --test --test-concurrency=1 src/astrologers.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Astrologer } from './models.js';
import { EDITOR, VIEWER, boot } from './test-kit.mjs';

let h;
const form = (o = {}) => ({ name: 'Acharya Rao', ratePerMin: 12, signInEmail: 'Rao@Example.com', specialities: 'Vedic, Tarot', languages: ['Hindi', 'English'], ...o });
const claim = (decoded, iss = 'identity') => h.call('POST', '/directory/astrologers/claim', { iss, body: { decoded } });
const active = (uid) => h.call('GET', `/directory/astrologers/active?uid=${encodeURIComponent(uid)}`, { iss: 'identity' });

before(async () => { h = await boot('calls_tests_astrologers'); });
after(() => h.stop());

test('create: normalises identifiers, defaults share from settings, starts invited and offline', async () => {
  const r = await h.call('POST', '/admin/astrologers', { body: form({ signInPhone: '+91 98765-43210' }) });
  assert.equal(r.status, 201);
  const a = r.body.astrologer;
  assert.deepEqual(Object.keys(a), ['id', 'name', 'bio', 'photoUrl', 'specialities', 'languages', 'yearsExperience', 'ratePerMin', 'platformSharePct', 'signInEmail', 'signInPhone', 'status', 'signedIn', 'listed', 'presence', 'lastSeenAt', 'lastSignInAt', 'calls30d']);
  assert.equal(a.signInEmail, 'rao@example.com');
  assert.equal(a.signInPhone, '+919876543210');
  assert.deepEqual([a.status, a.signedIn, a.platformSharePct, a.presence, a.ratingAvg], ['invited', false, 30, 'offline', undefined]);
  assert.deepEqual(a.specialities, ['Vedic', 'Tarot']);
});

test('the default share is read FRESH and fails closed: engagement down = 503 settings_unavailable, an explicit share needs no read', async () => {
  h.settings.down = true;
  const r = await h.call('POST', '/admin/astrologers', { body: { name: 'Zed', ratePerMin: 5, signInEmail: 'zed@example.com' } });
  assert.deepEqual([r.status, r.body.code], [503, 'settings_unavailable']);
  assert.equal(await Astrologer.countDocuments({ signInEmail: 'zed@example.com' }), 0);
  const ok = await h.call('POST', '/admin/astrologers', { body: { name: 'Zed', ratePerMin: 5, signInEmail: 'zed@example.com', platformSharePct: 40 } });
  assert.deepEqual([ok.status, ok.body.astrologer.platformSharePct], [201, 40]);
  h.settings.down = false;
  h.settings.values.defaultSharePct = '25';
  const dflt = await h.call('POST', '/admin/astrologers', { body: { name: 'Yan', ratePerMin: 5, signInEmail: 'yan@example.com' } });
  assert.equal(dflt.body.astrologer.platformSharePct, 25);
  h.settings.values.defaultSharePct = '30';
  for (const e of ['zed@example.com', 'yan@example.com']) await Astrologer.deleteOne({ signInEmail: e });
});

test('validation: needs a name, a whole-coin rate and at least one sign-in identifier', async () => {
  const code = async (body) => (await h.call('POST', '/admin/astrologers', { body })).body.code;
  assert.equal(await code({ ratePerMin: 5, signInEmail: 'a@b.co' }), 'name_required');
  assert.equal(await code({ name: 'x', ratePerMin: 0, signInEmail: 'a@b.co' }), 'bad_rate');
  assert.equal(await code({ name: 'x', ratePerMin: 5 }), 'identifier_required');
  assert.equal(await code({ name: 'x', ratePerMin: 5, signInPhone: '98765' }), 'bad_phone');
  assert.equal(await code({ name: 'x', ratePerMin: 5, signInEmail: 'nope' }), 'bad_email');
  assert.equal(await code({ name: 'x', ratePerMin: 5, signInEmail: 'a@b.co', platformSharePct: 101 }), 'bad_share');
});

test('a duplicate sign-in identifier is rejected on create and on update; two rows with no phone do not collide', async () => {
  const dupEmail = await h.call('POST', '/admin/astrologers', { body: form({ name: 'Other', signInEmail: 'RAO@example.com' }) });
  assert.deepEqual([dupEmail.status, dupEmail.body.code], [409, 'duplicate_identifier']);
  const dupPhone = await h.call('POST', '/admin/astrologers', { body: form({ name: 'Other', signInEmail: 'o@example.com', signInPhone: '+919876543210' }) });
  assert.equal(dupPhone.status, 409);
  const other = await h.call('POST', '/admin/astrologers', { body: form({ name: 'Other', signInEmail: 'other@example.com' }) });
  assert.equal((await h.call('PUT', `/admin/astrologers/${other.body.astrologer.id}`, { body: { signInEmail: 'rao@example.com' } })).status, 409);
  assert.equal(await Astrologer.countDocuments({ signInPhone: { $exists: false } }), 1);
  assert.equal((await h.call('POST', '/admin/astrologers', { body: form({ name: 'Third', signInEmail: 'third@example.com' }) })).status, 201);
});

test('update, list, 404 and delete', async () => {
  const list = await h.call('GET', '/admin/astrologers');
  const rao = list.body.astrologers.find((a) => a.name === 'Acharya Rao');
  const up = await h.call('PUT', `/admin/astrologers/${rao.id}`, { body: { ratePerMin: 20, bio: 'Hi' } });
  assert.deepEqual([up.body.astrologer.ratePerMin, up.body.astrologer.signInEmail], [20, 'rao@example.com']);
  assert.equal((await h.call('PUT', '/admin/astrologers/nope', { body: {} })).status, 404);
  assert.equal((await h.call('PUT', `/admin/astrologers/${rao.id}`, { body: { signInEmail: '', signInPhone: '' } })).status, 400, 'cannot remove every identifier');
  const del = await h.call('DELETE', `/admin/astrologers/${list.body.astrologers.find((a) => a.name === 'Third').id}`);
  assert.deepEqual(del.body, { ok: true });
});

test('sign-in identifiers are masked for roles without astrologers:edit, in full for those with it', async () => {
  const full = (await h.call('GET', '/admin/astrologers')).body.astrologers.find((a) => a.name === 'Acharya Rao');
  assert.deepEqual([full.signInEmail, full.signInPhone], ['rao@example.com', '+919876543210']);
  for (const perms of [EDITOR, VIEWER]) {
    const m = (await h.call('GET', '/admin/astrologers', { perms })).body.astrologers.find((a) => a.name === 'Acharya Rao');
    assert.deepEqual([m.signInEmail, m.signInPhone], ['r•••@example.com', '+91••••••3210']);
  }
});

test('sign-in claim: a verified e-mail claims the invite (atomic), once; shape is { astrologer: { id, name } }', async () => {
  const r = await claim({ uid: 'g1', email: 'rao@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
  assert.deepEqual(Object.keys(r.body), ['astrologer']);
  assert.deepEqual(Object.keys(r.body.astrologer), ['id', 'name']);
  assert.equal(r.body.astrologer.name, 'Acharya Rao');
  const a = await Astrologer.findOne({ uid: 'g1' });
  assert.equal(a.status, 'active');
  assert.ok(a.lastSignInAt);
  assert.equal((await claim({ uid: 'g1', email: 'rao@example.com', email_verified: true })).body.astrologer.name, 'Acharya Rao', 'signing in again keeps it');
  assert.equal((await h.call('GET', '/astrologer/me', { uid: 'g1' })).status, 200);
  assert.deepEqual((await active('g1')).body.astrologer, r.body.astrologer);
  assert.deepEqual((await active('nobody')).body, { astrologer: null });
});

test('sign-in claim: a user-typed (unverified) e-mail can NOT claim an invite; a phone token with no e-mail cannot either', async () => {
  await h.call('POST', '/admin/astrologers', { body: form({ name: 'Eve', signInEmail: 'eve@example.com' }) });
  assert.deepEqual((await claim({ uid: 'ph1', phone_number: '+911111111111' })).body, { astrologer: null });
  assert.deepEqual((await claim({ uid: 'ph1', email: 'eve@example.com', email_verified: false })).body, { astrologer: null });
  assert.deepEqual((await claim({ uid: 'ph1', email: 'eve@example.com', email_verified: 'true' })).body, { astrologer: null }, 'only the boolean true counts');
  assert.equal((await Astrologer.findOne({ name: 'Eve' })).uid, undefined);
  assert.equal((await h.call('GET', '/astrologer/me', { uid: 'ph1' })).status, 403);
  // the provider vouches (Google) even without the flag
  assert.equal((await claim({ uid: 'eve1', email: 'EVE@example.com', firebase: { sign_in_provider: 'google.com' } })).body.astrologer.name, 'Eve');
});

test('sign-in claim: matches by verified phone; one invite is claimed once; extra fields in the body are not honoured', async () => {
  await h.call('POST', '/admin/astrologers', { body: { name: 'Meera Devi', ratePerMin: 8, signInPhone: '+919000000001' } });
  assert.equal((await claim({ uid: 'ph2', phone_number: '+919000000001', role: 'admin', status: 'active', email: 'x@y.co' })).body.astrologer.name, 'Meera Devi');
  assert.deepEqual((await claim({ uid: 'ph3', phone_number: '+919000000001' })).body, { astrologer: null }, 'a second account with the same verified identity does not take it over');
  assert.equal((await Astrologer.findOne({ uid: 'ph2' })).signInPhone, '+919000000001');
});

test('two devices claiming one invite at the same moment: exactly one wins', async () => {
  await h.call('POST', '/admin/astrologers', { body: { name: 'Race', ratePerMin: 8, signInEmail: 'race@example.com' } });
  const rs = await Promise.all(['d1', 'd2', 'd3', 'd4'].map((uid) => claim({ uid, email: 'race@example.com', email_verified: true })));
  assert.equal(rs.filter((r) => r.body.astrologer).length, 1);
  assert.equal(await Astrologer.countDocuments({ name: 'Race', uid: { $exists: true } }), 1);
});

test('the claim endpoints validate their input and refuse a missing uid', async () => {
  assert.equal((await h.call('POST', '/directory/astrologers/claim', { iss: 'identity', body: {} })).status, 400);
  assert.equal((await h.call('POST', '/directory/astrologers/claim', { iss: 'identity', body: { decoded: { uid: 5 } } })).status, 400);
  assert.equal((await h.call('GET', '/directory/astrologers/active', { iss: 'identity' })).status, 400);
});

test('suspended => the claim answers null (a devotee again) and no role endpoints; reactivate restores; the role goes to identity (best effort)', async () => {
  const a = await Astrologer.findOne({ uid: 'g1' });
  h.identity.roleWrites.length = 0;
  const s = await h.call('POST', `/admin/astrologers/${a._id}/suspend`);
  assert.equal(s.body.astrologer.status, 'suspended');
  assert.deepEqual(h.identity.roleWrites, [{ uid: 'g1', role: 'devotee' }]);
  assert.deepEqual((await claim({ uid: 'g1', email: 'rao@example.com', email_verified: true })).body, { astrologer: null });
  assert.deepEqual((await active('g1')).body, { astrologer: null });
  assert.equal((await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: true } })).status, 403);
  await h.call('POST', `/admin/astrologers/${a._id}/reactivate`);
  assert.equal((await h.call('GET', '/astrologer/me', { uid: 'g1' })).status, 200);
  assert.deepEqual(h.identity.roleWrites.at(-1), { uid: 'g1', role: 'astrologer' });
  // identity down: the lifecycle still works (the role is re-derived at the next sign-in)
  h.identity.down = true;
  const s2 = await h.call('POST', `/admin/astrologers/${a._id}/suspend`);
  assert.equal(s2.status, 200);
  await h.call('POST', `/admin/astrologers/${a._id}/reactivate`);
  h.identity.down = false;
});

test('changing the sign-in identifier unlinks the old account and re-opens the invite', async () => {
  const a = await Astrologer.findOne({ uid: 'ph2' });
  h.identity.roleWrites.length = 0;
  const r = await h.call('PUT', `/admin/astrologers/${a._id}`, { body: { signInPhone: '+919000000002' } });
  assert.deepEqual([r.body.astrologer.status, r.body.astrologer.signedIn], ['invited', false]);
  assert.deepEqual(h.identity.roleWrites, [{ uid: 'ph2', role: 'devotee' }]);
  assert.equal((await h.call('GET', '/astrologer/me', { uid: 'ph2' })).status, 403);
});

test('delete revokes the role and keeps the call history', async () => {
  const a = await Astrologer.findOne({ uid: 'eve1' });
  h.identity.roleWrites.length = 0;
  assert.deepEqual((await h.call('DELETE', `/admin/astrologers/${a._id}`)).body, { ok: true });
  assert.deepEqual(h.identity.roleWrites, [{ uid: 'eve1', role: 'devotee' }]);
  assert.equal(await Astrologer.countDocuments({ uid: 'eve1' }), 0);
});

test('presence: online/offline, heartbeat, busy cannot be forced, the public list is derived from freshness', async () => {
  assert.equal((await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: { presence: 'busy' } })).status, 400);
  assert.equal((await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: {} })).body.code, 'bad_presence');
  assert.equal((await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: true } })).body.presence, 'online');
  let pub = await h.call('GET', '/astrologers', { uid: 'x' });
  const mine = (r) => r.body.astrologers.filter((x) => x.name === 'Acharya Rao');
  assert.deepEqual(mine(pub).map((x) => [x.name, x.presence]), [['Acharya Rao', 'online']]);
  assert.deepEqual(pub.body.astrologers.map((x) => x.presence), ['online', 'offline'], 'online first, then offline');
  assert.deepEqual(Object.keys(mine(pub)[0]), ['id', 'name', 'bio', 'photoUrl', 'specialities', 'languages', 'yearsExperience', 'ratePerMin', 'presence']);
  await Astrologer.updateOne({ uid: 'g1' }, { $set: { lastSeenAt: new Date(Date.now() - 60_000) } });
  assert.equal(mine(await h.call('GET', '/astrologers', { uid: 'x' }))[0].presence, 'offline', 'stale heartbeat reads offline');
  assert.equal((await h.call('POST', '/astrologer/me/heartbeat', { uid: 'g1' })).body.ok, true);
  assert.equal(mine(await h.call('GET', '/astrologers', { uid: 'x' }))[0].presence, 'online');
  assert.equal((await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: false } })).body.presence, 'offline');
  const id = (await Astrologer.findOne({ uid: 'g1' }))._id;
  await h.call('PUT', `/admin/astrologers/${id}`, { body: { listed: false } });
  assert.equal(mine(await h.call('GET', '/astrologers', { uid: 'x' })).length, 0, 'unlisted astrologers vanish from the public list');
  assert.equal((await h.call('GET', `/astrologers/${id}`, { uid: 'x' })).status, 404);
});

test('the public profile: one astrologer; a non-id and an unknown id are 404 astrologer_not_found', async () => {
  const a = await Astrologer.findOne({ uid: 'g1' });
  await Astrologer.updateOne({ _id: a._id }, { $set: { listed: true } });
  const r = await h.call('GET', `/astrologers/${a._id}`, { uid: 'x' });
  assert.deepEqual(Object.keys(r.body), ['astrologer']);
  assert.equal(r.body.astrologer.name, 'Acharya Rao');
  assert.equal((await h.call('GET', '/astrologers/nope', { uid: 'x' })).body.code, 'astrologer_not_found');
});

test('going offline while on a call is refused with 409; the astrologer\'s own call list shows what they earned, never what the devotee paid', async () => {
  const a = await Astrologer.findOne({ uid: 'g1' });
  await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: true } });
  h.wallet.fund('dv', 100);
  const c = await h.call('POST', '/calls', { uid: 'dv', name: 'Dev Kumar', body: { astrologerId: String(a._id), requestId: 'z1' } });
  assert.equal(c.status, 201);
  await h.call('POST', `/calls/${c.body.call.id}/accept`, { uid: 'g1' });
  const off = await h.call('PUT', '/astrologer/me/presence', { uid: 'g1', body: { online: false } });
  assert.deepEqual([off.status, off.body.code], [409, 'on_a_call']);
  const me = await h.call('GET', '/astrologer/me/calls', { uid: 'g1' });
  assert.equal(me.body.calls.length, 1);
  assert.ok(me.body.calls[0].earnedPaise > 0);
  assert.equal(me.body.calls[0].coins, undefined);
  assert.equal(me.body.calls[0].devoteeName, 'Dev');
  const prof = await h.call('GET', '/astrologer/me', { uid: 'g1' });
  assert.ok(!('signInEmail' in prof.body.astrologer) && !('signInPhone' in prof.body.astrologer), 'an astrologer is not handed their own sign-in identifiers back');
});
