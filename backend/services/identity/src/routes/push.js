import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { onlyFrom } from '../lib/perms.js';
import { hasDevice, registerDevice, unregisterDevice } from '../lib/push.js';

/** Who may send a notification, or ask whether a person can receive one. Nobody else - least of all a BFF. */
export const PUSH_SENDERS = ['calls', 'orders', 'engagement'];

const subject = (req) => {
  const uid = req.auth?.sub;
  if (!uid || typeof uid !== 'string') throw new HttpError(401, 'bad_subject', 'The token names no account.');
  return uid;
};

/**
 * The push registry: /internal/identity/push/*
 *
 *   POST   register   {token, platform}   mobile-bff: the signed-in account's phone. The account is the token's `sub`, never the body.
 *   DELETE register   {token}             mobile-bff: forget my phone (only removes MY row).
 *   POST   send       {uid, title, body, data, channelId, ttlSeconds, tag}   calls / orders / engagement. Always 200 {sent, devices}.
 *   GET    reachable  ?uid=                                                  calls / orders / engagement. {reachable}
 */
export function pushRoutes({ push }) {
  const r = asyncRouter();

  r.post('/register', onlyFrom('mobile-bff'), async (req, res) => {
    const out = await registerDevice(subject(req), req.body ?? {});
    if (!out.ok) throw new HttpError(400, out.code, 'A push token is required.');
    res.status(201).json({ ok: true });
  });

  r.delete('/register', onlyFrom('mobile-bff'), async (req, res) => {
    const out = await unregisterDevice(subject(req), req.body?.token);
    if (!out.ok) throw new HttpError(400, out.code, 'A push token is required.');
    res.json({ ok: true });
  });

  r.post('/send', onlyFrom(...PUSH_SENDERS), async (req, res) => {
    const b = req.body ?? {};
    if (typeof b.uid !== 'string' || !b.uid.trim()) throw new HttpError(400, 'bad_request', 'uid is required.');
    if (typeof b.title !== 'string' || !b.title.trim()) throw new HttpError(400, 'bad_request', 'title is required.');
    res.json(await push.pushToUid(b.uid.trim(), b));
  });

  r.get('/reachable', onlyFrom(...PUSH_SENDERS), async (req, res) => {
    const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
    if (!uid) throw new HttpError(400, 'bad_request', 'uid is required.');
    res.json({ reachable: await hasDevice(uid) });
  });

  return r;
}
