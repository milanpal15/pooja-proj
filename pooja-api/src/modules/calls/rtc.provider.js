import { HttpError } from '../../lib/http-error.js';

/**
 * Real-time-audio provider, behind one interface so the call logic never
 * names a vendor:
 *
 *   provider.issue({ channel, uid }) -> { provider, appId, channel, token, uid }
 *
 * `agora` signs short-lived tokens with the `agora-token` package. `mock`
 * returns a fake channel so dev and tests can run a whole call with no vendor
 * account — and is REFUSED in production, where a fake token would make every
 * call "connect" to nothing while still charging for it.
 *
 * Choice: `RTC_PROVIDER`; unset means agora when both Agora variables exist,
 * else mock outside production. Anything unusable answers 503 calls_unavailable.
 */
const TOKEN_TTL_SEC = 2 * 60 * 60; // a call is re-issued credentials on every poll; this is just the ceiling

const unavailable = (why) => new HttpError(503, 'calls_unavailable', `Calls are not available right now (${why}).`);

function mockProvider() {
  return {
    name: 'mock',
    async issue({ channel, uid }) {
      return { provider: 'mock', appId: 'mock-app', channel, token: `mock-${channel}-${uid}`, uid };
    },
  };
}

function agoraProvider(appId, certificate) {
  return {
    name: 'agora',
    async issue({ channel, uid }) {
      // CommonJS package: under ESM the builders hang off `default`.
      const mod = await import('agora-token');
      const { RtcTokenBuilder, RtcRole } = mod.default ?? mod;
      const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
      const token = RtcTokenBuilder.buildTokenWithUid(appId, certificate, channel, uid, RtcRole.PUBLISHER, expire, expire);
      return { provider: 'agora', appId, channel, token, uid };
    },
  };
}

/** Resolve the provider for this environment, or throw `503 calls_unavailable`. */
export function getRtcProvider(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const haveAgora = !!(env.AGORA_APP_ID && env.AGORA_APP_CERTIFICATE);
  const chosen = (env.RTC_PROVIDER || (haveAgora ? 'agora' : prod ? '' : 'mock')).toLowerCase();

  if (chosen === 'agora') {
    if (!haveAgora) throw unavailable('AGORA_APP_ID / AGORA_APP_CERTIFICATE are not set');
    return agoraProvider(env.AGORA_APP_ID, env.AGORA_APP_CERTIFICATE);
  }
  if (chosen === 'mock') {
    if (prod) throw unavailable('the mock audio provider is refused in production');
    return mockProvider();
  }
  throw unavailable('no audio provider is configured');
}

/** Stable numeric RTC uids: Agora wants an integer, and each side of a call needs its own. */
export const RTC_UID = { devotee: 1, astrologer: 2 };
