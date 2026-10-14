import { loadEnv, serviceUrl } from '@bhakti/common';

const ms = (v) => Math.max(Number(v) || 0, 0);

/** The ONLY file in this service that reads process.env. `.env` is loaded by server.js (dotenv). */
export const loadConfig = (env = process.env) => {
  const c = {
    ...loadEnv(env, {
      port: { name: 'PORT', default: 4080, parse: Number },
      mongodbUri: { name: 'MONGODB_URI', default: 'mongodb://127.0.0.1:27017' },
      dbName: { name: 'DB_NAME', default: 'calls' },
      secret: { name: 'INTERNAL_JWT_SECRET', required: true },
      allowedIssuers: {
        name: 'ALLOWED_ISSUERS',
        default: ['mobile-bff', 'admin-bff', 'identity'],
        parse: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
      },
      // The three services a call is made from. All required: a call without coins, a name or a rule is not a call.
      walletUrl: { name: 'WALLET_URL', required: true, parse: serviceUrl },
      identityUrl: { name: 'IDENTITY_URL', required: true, parse: serviceUrl },
      engagementUrl: { name: 'ENGAGEMENT_URL', required: true, parse: serviceUrl },
      serviceTimeoutMs: { name: 'SERVICE_TIMEOUT_MS', default: 5000, parse: Number },
      // The wallet call is a MONEY call: its timeout is what turns a lost answer into "asked again with the same key". Same 5 s as the monolith's client.
      walletTimeoutMs: { name: 'WALLET_TIMEOUT_MS', default: 5000, parse: Number },
      // A balance that is only SHOWN (the call view): shorter than a money call, so a frozen wallet cannot hold every poll for 5 s.
      walletDisplayTimeoutMs: { name: 'WALLET_DISPLAY_TIMEOUT_MS', default: 1500, parse: Number },
      expoPushUrl: { name: 'EXPO_PUSH_URL', default: 'https://exp.host/--/api/v2/push/send' },
      // Derives the devotee pseudonyms ("Devotee ••4821"). Same value as the admin BFF / wallet / orders. Unset = random per boot.
      sessionSecret: { name: 'ADMIN_SESSION_SECRET', default: '' },
      // Real-time audio provider (moved here from the monolith's environment, unchanged semantics: see lib/rtc.js).
      rtcProvider: { name: 'RTC_PROVIDER', default: '' },
      agoraAppId: { name: 'AGORA_APP_ID', default: '', parse: (v) => v.trim() },
      agoraAppCertificate: { name: 'AGORA_APP_CERTIFICATE', default: '', parse: (v) => v.trim() },
      // The billing clock (0 = off) and the silence limit.
      tickEveryMs: { name: 'TICK_EVERY_MS', default: 5000, parse: ms },
      silenceMs: { name: 'SILENCE_MS', default: 90_000, parse: ms },
      // The refund sweeper: how often (0 = off), how old a pending intent must be before it is looked at, and how long an unknown key waits.
      sweepEveryMs: { name: 'SWEEP_EVERY_MS', default: 5000, parse: ms },
      intentMinAgeMs: { name: 'INTENT_MIN_AGE_MS', default: 10_000, parse: ms },
      intentGraceMs: { name: 'INTENT_GRACE_MS', default: 120_000, parse: ms },
      // Terminal intents are deleted after this many days; pending ones never are.
      intentRetentionDays: { name: 'INTENT_RETENTION_DAYS', default: 30, parse: (v) => Math.max(Number(v) || 30, 1) },
      pruneEveryMs: { name: 'PRUNE_EVERY_MS', default: 3_600_000, parse: ms },
    }),
    isProduction: env.NODE_ENV === 'production',
    commit: env.RENDER_GIT_COMMIT || env.GIT_COMMIT || null,
  };
  if (c.secret.length < 16) throw new Error('INTERNAL_JWT_SECRET must be at least 16 characters.');
  return Object.freeze({
    ...c,
    // What lib/rtc.js resolves its provider from: the same four names the monolith read from process.env, as plain data.
    rtcEnv: Object.freeze({ NODE_ENV: c.isProduction ? 'production' : env.NODE_ENV, RTC_PROVIDER: c.rtcProvider, AGORA_APP_ID: c.agoraAppId, AGORA_APP_CERTIFICATE: c.agoraAppCertificate }),
  });
};

export const config = () => loadConfig(process.env);
