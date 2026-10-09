import type { RemoteHeroSlide } from '@/providers/content';

import type { HomeSlide } from '../types';
import { pick } from './pick';
import { inWindow } from './schedule';

/** The app's language as the dashboard names it. */
export type SlideLang = 'en' | 'hi';

/**
 * Which slides the devotee should see right now: enabled, inside their
 * start/end window, and addressed to the app's language (or to "all").
 *
 * The API already filters the public list, but a slide can start or expire
 * while the app is open and the dashboard's `language` is an audience, not a
 * translation — so the client re-checks both on a timer.
 */
export function visibleSlides(raw: RemoteHeroSlide[], lang: SlideLang, now: number): RemoteHeroSlide[] {
  return raw.filter((s) => {
    if (s.enabled === false) return false;
    const audience = s.language ?? 'all';
    if (audience !== 'all' && audience !== lang) return false;
    return inWindow(s.startsAt, s.endsAt, now);
  });
}

type Finish = {
  /** Make a host-relative upload absolute. */
  image: (url: string | undefined) => string | undefined;
  /** Rewrite uploads inside an HTML slide and wrap it in its CSP document. */
  html: (fragment: string) => string;
};

/**
 * Raw dashboard rows -> display slides. A slide with neither a title nor
 * artwork has nothing to draw and is dropped rather than shown as a blank card.
 */
export function toSlides(rows: RemoteHeroSlide[], hi: boolean, finish: Finish): HomeSlide[] {
  const out: HomeSlide[] = [];
  for (const r of rows) {
    const title = pick(hi, r.title, r.titleHi).trim();
    const image = finish.image(r.image);
    const html = pick(hi, r.html, r.htmlHi).trim();
    const isHtml = r.kind === 'html' && !!html;
    if (!title && !image && !isHtml) continue;
    out.push({
      id: r.slug || r._id,
      kind: isHtml ? 'html' : 'banner',
      tag: pick(hi, r.tag, r.tagHi).trim(),
      title,
      sub: pick(hi, r.subtitle, r.subtitleHi).trim(),
      cta: pick(hi, r.ctaLabel, r.ctaLabelHi).trim(),
      href: (r.href || r.ctaHref || '').trim(),
      image,
      html: isHtml ? finish.html(html) : undefined,
    });
  }
  return out;
}
