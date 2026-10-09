/**
 * The backend client, split by domain. Everything is re-exported here so
 * `import … from '@/lib/api'` keeps working from anywhere.
 */
export { ApiError, authedFetch, isOffline } from './client';
export * from './astrologer-me';
export * from './astrologers';
export * from './auth';
export * from './bookings';
export * from './calls';
export * from './chadhava';
export * from './live';
export * from './poojas';
export * from './wallet';
