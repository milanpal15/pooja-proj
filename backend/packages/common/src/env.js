/**
 * `loadEnv` — the pattern every service/BFF `src/config.js` follows.
 *
 *   // src/config.js  (the ONLY file in a project that touches process.env)
 *   import { loadEnv } from '@bhakti/common';
 *   export const loadConfig = (env = process.env) =>
 *     loadEnv(env, {
 *       port:        { name: 'PORT', default: 4010, parse: Number },
 *       monolithUrl: { name: 'MONOLITH_URL', default: 'http://127.0.0.1:4000' },
 *       secret:      { name: 'INTERNAL_JWT_SECRET', required: true },
 *     });
 *   export const config = loadConfig(process.env);
 *
 * Rules: `.env` loading (dotenv) happens in `server.js`, never here; `app.js` takes the config as an
 * argument so tests pass their own; every variable named here is listed in `.env.example`.
 */
export function loadEnv(env, spec) {
  const out = {};
  const missing = [];
  for (const [key, def] of Object.entries(spec)) {
    const raw = env[def.name];
    if (raw === undefined || raw === '') {
      if (def.required) missing.push(def.name);
      out[key] = def.default;
    } else {
      out[key] = def.parse ? def.parse(raw) : raw;
    }
  }
  if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  return Object.freeze(out);
}

/**
 * `serviceUrl` - normalise the address of another service or an upstream.
 *
 * Render hands `fromService` references over as a BARE host (`bhakti-wallet:10000` for a private service,
 * `bhakti-wallet.onrender.com` for a public one), never a URL. This accepts either form so a blueprint can wire
 * services together with no hand-typing:
 *   - already has a scheme            -> kept as given (`http://127.0.0.1:4060`, `https://x.example`)
 *   - localhost / an IPv4 address / a name with no dot (a private-network host) -> `http://`
 *   - anything else (a public host name) -> `https://`
 * Surrounding whitespace and trailing slashes are dropped. An empty value stays empty ("not set").
 */
export function serviceUrl(value) {
  const v = String(value ?? '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  const host = v.split(/[/?#]/)[0].replace(/:\d+$/, '');
  const plain = host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes('.');
  return `${plain ? 'http' : 'https'}://${v}`;
}
