import type { RemoteHomeItem, RemoteHomeSection } from '@/providers/content';

import { pick } from '../lib/pick';

/** A section's title / footer in the reading language, falling back to English. */
export const sectionTitle = (s: RemoteHomeSection, hi: boolean) => pick(hi, s.title, s.titleHi);
export const sectionFooter = (s: RemoteHomeSection, hi: boolean) => pick(hi, s.footerLabel, s.footerLabelHi);
export const itemTitle = (i: RemoteHomeItem, hi: boolean) => pick(hi, i.title, i.titleHi);
export const itemSub = (i: RemoteHomeItem, hi: boolean) => pick(hi, i.subtitle, i.subtitleHi);
