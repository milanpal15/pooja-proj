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
export * from './events';
export * from './home-layout';
export * from './live';
export * from './places';
export * from './poojas';
export * from './wallet';
export * from './push';
