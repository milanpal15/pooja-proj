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
 */
export const ADMIN_API = 'http://127.0.0.1:4000';
