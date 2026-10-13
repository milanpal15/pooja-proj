/**
 * The ONE place the app reads its environment (`EXPO_PUBLIC_*`, set in `.env`; see `.env.example`).
 *
 * Import from here — `import { ADMIN_API } from '@/constants/config'` — and nowhere else touches
 * `process.env`. Two things worth knowing:
 *   - Expo inlines `process.env.EXPO_PUBLIC_X` into the JS bundle at build time, and only when it is
 *     written literally, so each variable is spelled out below rather than looked up by name.
 *   - Everything here ships inside the app, so NOTHING secret belongs in it. Server secrets (Razorpay,
 *     Firebase service account, database URI) live only in `pooja-api/.env` / the host's dashboard.
 *
 * Changing a value needs Metro restarted (`npx expo start --clear`), not just an app reload.
 */

/**
 * Base URL of the pooja-admin MERN backend.
 *
 * The phone must be able to reach your Mac. There are two ways:
 *
 * 1. USB (most reliable — what this is set to). Run once per session:
 *        adb reverse tcp:4000 tcp:4000
 *    then the phone's 127.0.0.1:4000 tunnels to the Mac's backend, regardless
 *    of Wi-Fi / cellular. Keep the value below as http://127.0.0.1:4000.
 *
 * 2. Wi-Fi. The phone and Mac must be on the SAME network; set this to the
 *    Mac's LAN IP (find it with `ipconfig getifaddr en0`), e.g.
 *        export const ADMIN_API = 'http://192.168.1.12:4000';
 *    If the phone drops to cellular or is on another network, it can't reach
 *    the Mac and the app falls back to default (all-enabled) feature flags.
 *
 * All calls are best-effort: if the backend is unreachable the app falls back
 * to the last-synced flags (or the built-in defaults) and keeps working.
 *
 * Set EXPO_PUBLIC_ADMIN_API in `.env` to point at a deployed backend; the
 * literal below is only the USB-tunnel default for local development.
 */
export const ADMIN_API = process.env.EXPO_PUBLIC_ADMIN_API ?? 'http://127.0.0.1:4000';

/**
 * The **web** OAuth client id from your Firebase project (google-services.json
 * → `oauth_client` → the entry with `client_type: 3`).
 *
 * Google Sign-In needs this to mint an ID token Firebase will accept. The
 * Android client id will not do — with the wrong one, sign-in fails with a
 * bare `DEVELOPER_ERROR` that names nothing.
 *
 * Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in `.env`, or paste the value here.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/**
 * Where the app lives in a store. Deliberately EMPTY by default: a made-up link is worse than none.
 * Set `EXPO_PUBLIC_STORE_URL` for a release and the Profile "Rate the app" row appears and the share
 * text gains the link.
 */
export const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL ?? '';

/*
 * Devotee support contact details.
 *
 * Deliberately **empty by default**. The app previously shipped `support@shrimandir.devotee` —
 * `.devotee` is not a real TLD, so every message bounced — and `tel:18007665273`, a vanity spelling
 * that is a dialable number somebody else may well own. Placeholder contact details are worse than
 * none: a devotee with a problem spends their effort on a channel nobody is listening to.
 *
 * Set these for your deployment and the Help & Support screen shows the matching actions. Leave one
 * blank and that action is hidden rather than offered and broken.
 */

/** e.g. `support@yourtemple.org` */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';

/** Digits only, dialable as-is. e.g. `+911800123456` */
export const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '';

/** Shown under the helpline heading. Blank hides the line. */
export const SUPPORT_HOURS_EN = process.env.EXPO_PUBLIC_SUPPORT_HOURS_EN ?? '';
export const SUPPORT_HOURS_HI = process.env.EXPO_PUBLIC_SUPPORT_HOURS_HI ?? '';
