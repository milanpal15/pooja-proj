import { ANGLE_REST, TWO_PI } from '../constants/orbit';

/** Nearest angle congruent to ANGLE_REST, so the thali returns the short way. */
export function nearestRest(current: number) {
  'worklet';
  return ANGLE_REST + Math.round((current - ANGLE_REST) / TWO_PI) * TWO_PI;
}
