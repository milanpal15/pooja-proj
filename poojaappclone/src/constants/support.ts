/**
 * Devotee support contact details.
 *
 * Deliberately **empty by default**. The app previously shipped
 * `support@shrimandir.devotee` — `.devotee` is not a real TLD, so every
 * message bounced — and `tel:18007665273`, a vanity spelling of
 * "1800-POOJA-SEVA" that is a dialable number somebody else may well own.
 * Placeholder contact details are worse than none: a devotee with a problem
 * spends their effort on a channel nobody is listening to.
 *
 * Set these for your deployment and the Help & Support screen shows the
 * matching actions. Leave one blank and that action is hidden rather than
 * offered and broken.
 */

/** e.g. `support@yourtemple.org` */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';

/** Digits only, dialable as-is. e.g. `+911800123456` */
export const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '';

/** Shown under the helpline heading. Blank hides the line. */
export const SUPPORT_HOURS_EN = process.env.EXPO_PUBLIC_SUPPORT_HOURS_EN ?? '';
export const SUPPORT_HOURS_HI = process.env.EXPO_PUBLIC_SUPPORT_HOURS_HI ?? '';
