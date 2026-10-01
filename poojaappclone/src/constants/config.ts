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
