import { HeroSlide, HomeSection } from '../../models.js';
import { inWindow } from '../../lib/window.js';
import { heroHref } from '../content/resources/hero-target.js';
import { sanitizeHtmlFragment } from './html-sanitizer.js';
import { ITEM_SOURCES } from './home.model.js';

export { inWindow };

const s = (v) => (typeof v === 'string' ? v : '');
const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Shape a slide for the app; HTML is cleaned again here, whatever is stored. */
export function heroView(h) {
  return {
    slug: h.slug,
    tag: s(h.tag), tagHi: s(h.tagHi),
    language: ['hi', 'en'].includes(h.language) ? h.language : 'all',
    target: h.target?.type ? { type: h.target.type, ref: s(h.target.ref) } : { type: 'none', ref: '' },
    kind: h.kind === 'html' ? 'html' : 'banner',
    title: s(h.title), titleHi: s(h.titleHi), subtitle: s(h.subtitle), subtitleHi: s(h.subtitleHi),
    deitySlug: s(h.deitySlug), href: h.target?.type ? heroHref(h.target) : s(h.href),
    image: s(h.image),
    html: sanitizeHtmlFragment(h.html), htmlHi: sanitizeHtmlFragment(h.htmlHi),
    ctaLabel: s(h.ctaLabel), ctaLabelHi: s(h.ctaLabelHi), ctaHref: s(h.ctaHref),
    startsAt: iso(h.startsAt), endsAt: iso(h.endsAt),
    order: h.order ?? 0, enabled: h.enabled !== false,
  };
}

const itemView = (i) => ({
  title: s(i.title), titleHi: s(i.titleHi), subtitle: s(i.subtitle), subtitleHi: s(i.subtitleHi),
  icon: s(i.icon), image: s(i.image), href: s(i.href), badge: s(i.badge), flag: s(i.flag), deitySlug: s(i.deitySlug),
});

export function sectionView(r) {
  return {
    key: r.key, source: r.source,
    title: s(r.title), titleHi: s(r.titleHi), tone: r.tone, layout: r.layout,
    items: (r.items ?? []).map(itemView),
    footerLabel: s(r.footerLabel), footerLabelHi: s(r.footerLabelHi), footerHref: s(r.footerHref),
    startsAt: iso(r.startsAt), endsAt: iso(r.endsAt),
    order: r.order ?? 0, enabled: r.enabled !== false,
  };
}

export const HERO_CAP = 8;

/** `hero` for GET /api/content: enabled, in-window, ordered, at most 8. */
export async function publicHero(now = new Date()) {
  const rows = await HeroSlide.find({ enabled: true }).sort({ order: 1 }).lean();
  return rows.filter((h) => inWindow(h, now)).slice(0, HERO_CAP).map(heroView);
}

/** `home` for GET /api/content: enabled, in-window, ordered; an item section with no items is left out. */
export async function publicHome(now = new Date()) {
  const rows = await HomeSection.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean();
  const sections = rows
    .filter((r) => inWindow(r, now))
    .filter((r) => !ITEM_SOURCES.includes(r.source) || (r.items ?? []).length > 0)
    .map(sectionView);
  return { sections };
}
