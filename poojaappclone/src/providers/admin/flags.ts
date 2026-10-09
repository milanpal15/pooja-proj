/** Toggleable app features, controllable from the Admin panel. */
export type FeatureKey =
  | 'virtualPooja'
  | 'bhajan'
  | 'chadhava'
  | 'journal'
  | 'liveDarshan'
  | 'payments'
  | 'announcements'
  | 'phoneAuth'
  | 'astrologerCalls';

export type Flags = Record<FeatureKey, boolean>;

/*
 * Every flag defaults ON so an unreachable backend hides nothing — except
 * `phoneAuth`, which defaults OFF.
 *
 * The usual fail-open reasoning inverts here. Firebase stopped sending
 * verification SMS on the free Spark plan in September 2024; it now needs a
 * Blaze billing account. Failing open would put a Mobile button on the login
 * screen that cannot possibly work — every tap ends in BILLING_NOT_ENABLED.
 * Offering a sign-in route that is guaranteed to fail is worse than not
 * offering it, so this one stays off until the dashboard says otherwise.
 */
export const DEFAULT_FLAGS: Flags = {
  virtualPooja: true,
  bhajan: true,
  chadhava: true,
  journal: true,
  liveDarshan: true,
  payments: true,
  announcements: true,
  phoneAuth: false,
  astrologerCalls: true,
};
