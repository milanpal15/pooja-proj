import { AARTI_CIRCLES } from '@/constants/deities';

export const TWO_PI = Math.PI * 2;
/** Resting spot: bottom of the circle, in screen coords where +y points down. */
export const ANGLE_REST = Math.PI / 2;
export const TOTAL = TWO_PI * AARTI_CIRCLES;
/** Firm, non-bouncy return so the thali settles home without dangling. */
export const RETURN_SPRING = { damping: 22, stiffness: 180, overshootClamping: true } as const;

/** AsyncStorage key for the persisted aarti completion count. */
export const TOTAL_AARTIS_KEY = 'pooja.totalAartis';
