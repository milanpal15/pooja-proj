/**
 * Where the app lives in a store. Deliberately EMPTY by default: a made-up
 * link is worse than none. Set `EXPO_PUBLIC_STORE_URL` for a release and the
 * Profile "Rate the app" row appears and the share text gains the link.
 */
export const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL ?? '';
