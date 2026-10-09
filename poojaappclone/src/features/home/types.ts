/**
 * One slide of the Home slider, resolved for display: language already chosen,
 * uploads already absolute, HTML already wrapped. Built by `lib/slides.ts`.
 */
export type HomeSlide = {
  id: string;
  kind: 'banner' | 'html';
  /** Small pill above the title ("9 nights"); '' for none. */
  tag: string;
  title: string;
  sub: string;
  /** White button text; '' means the card has no button. */
  cta: string;
  /** Where a tap goes — an in-app route or https URL; '' for a card that just informs. */
  href: string;
  /** Uploaded artwork. Absent = a toned gradient. */
  image?: string;
  /** Sanitised, wrapped document for `kind: 'html'`. */
  html?: string;
};
