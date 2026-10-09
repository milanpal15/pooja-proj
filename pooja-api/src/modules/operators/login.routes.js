import { permissionsFor } from '../../access/permissions.js';
import { Operator } from './operator.model.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { COOKIE, CROSS_SITE, IS_PROD, MAX_AGE_MS, SAMESITE, sessionOf, setCookie, sign } from './session.js';
import { authRequired } from './operators.service.js';
import { perClient, perUser } from './login-limiter.js';

/** A password longer than this is refused without hashing it: scrypt on a huge string is a free CPU burn. */
const MAX_PASSWORD_LENGTH = 256;

export function mountAdminAuth(app) {
  app.post('/api/admin/login', async (req, res, next) => {
    try {
      if (!(await authRequired())) return res.json({ ok: true, required: false });

      const username = String(req.body?.username ?? '').toLowerCase().trim().slice(0, 64);
      const password = String(req.body?.password ?? '');
      const clientKey = `ip:${req.ip}`;
      const userKey = `${req.ip}|${username}`;

      for (const [limiter, key] of [[perClient, clientKey], [perUser, userKey]]) {
        const { blocked, retryAfterSec } = limiter.check(key);
        if (blocked) {
          res.setHeader('Retry-After', String(retryAfterSec));
          return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.', code: 'rate_limited', retryAfterSec });
        }
      }

      const tooLong = password.length > MAX_PASSWORD_LENGTH;
      const operator = tooLong ? null : await Operator.findOne({ username, active: true });
      let ok = false;
      if (operator) {
        ok = verifyPassword(password, operator.passwordHash);
      } else if (!tooLong) {
        // Hash anyway, so a missing username and a wrong password take the same
        // time and cannot be told apart.
        verifyPassword(password, hashPassword('never-matches'));
      }

      if (!operator || !ok) {
        perClient.fail(clientKey);
        perUser.fail(userKey);
        return res.status(401).json({ error: 'Wrong username or password' });
      }

      perUser.reset(userKey);
      await Operator.updateOne({ _id: operator._id }, { $set: { lastLogin: new Date() } });
      setCookie(res, sign({ uid: String(operator._id), role: operator.role, exp: Date.now() + MAX_AGE_MS }));
      res.json({ ok: true, required: true, username: operator.username, role: operator.role, permissions: permissionsFor(operator.role) });
    } catch (e) {
      next(e); // a database error is a 500, not a request that hangs
    }
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=; Path=/; HttpOnly; SameSite=${SAMESITE}; Max-Age=0${IS_PROD || CROSS_SITE ? '; Secure' : ''}`,
    );
    res.json({ ok: true });
  });

  /** Lets the dashboard pick between the login screen and the real UI. */
  app.get('/api/admin/session', async (req, res) => {
    const required = await authRequired();
    const s = sessionOf(req);
    if (!required) return res.json({ required: false, authed: true, role: 'admin', permissions: permissionsFor('admin') });
    if (!s) return res.json({ required: true, authed: false });

    // Read the role back from the record, not the cookie: a demotion must
    // take effect on the next request, not when the session happens to end.
    const operator = await Operator.findById(s.uid).lean();
    if (!operator || !operator.active) return res.json({ required: true, authed: false });
    res.json({ required: true, authed: true, username: operator.username, role: operator.role, permissions: permissionsFor(operator.role) });
  });
}
