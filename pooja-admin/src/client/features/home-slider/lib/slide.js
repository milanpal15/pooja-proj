import { formatDay, endOfDayIso, isoToDayKey, startOfDayIso } from '../../../lib/dates.js';

/**
 * Pure rules for the Home slider (docs/POOJA_AND_HOME.md §1b). No React, no
 * fetching: validation, the Live / Starts / Ended chip, the "Opens" label and
 * the draft <-> API-body mapping live here so `node --test` can pin them.
 */

export const MAX_LIVE = 8;
export const LIMITS = { title: 80, tag: 24, subtitle: 120, ctaLabel: 24 };

export const TARGET_TYPES = [
  { value: 'pooja', label: 'Pooja', refKind: 'poojas', refLabel: 'Which pooja' },
  { value: 'chadhava', label: 'Chadhava', refKind: 'listings', refLabel: 'Which listing' },
  { value: 'temple', label: 'Temple', refKind: 'temples', refLabel: 'Which temple' },
  { value: 'bhajan', label: 'Bhajan' },
  { value: 'astrologer', label: 'Astrologer' },
  { value: 'coins', label: 'Add coins' },
  { value: 'link', label: 'Web link', refLabel: 'Link (https only)' },
  { value: 'none', label: 'Nothing (not tappable)' },
];
export const LANGUAGES = [
  { value: 'all', label: 'All languages' },
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
];

const typeOf = (value) => TARGET_TYPES.find((t) => t.value === value);
export const needsRef = (type) => ['pooja', 'chadhava', 'temple', 'link'].includes(type);
export const refKindOf = (type) => typeOf(type)?.refKind;

/** Is `s` an https URL with a host and nothing a browser would not open? */
export function isHttpsUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === 'https:' && !!u.hostname && !/\s/.test(String(s).trim());
  } catch {
    return false;
  }
}

/** A new, empty slide as the editor holds it. */
export const blankSlide = () => ({
  title: '', titleHi: '', subtitle: '', subtitleHi: '', tag: '', tagHi: '', ctaLabel: '', ctaLabelHi: '',
  image: '', type: 'pooja', ref: '', language: 'all', start: '', end: '', enabled: true,
});

/** A stored slide -> the editor's draft (dates as YYYY-MM-DD, target flattened). */
export function draftFrom(s) {
  const b = blankSlide();
  const str = (k) => (typeof s[k] === 'string' ? s[k] : b[k]);
  return {
    ...Object.fromEntries(['title', 'titleHi', 'subtitle', 'subtitleHi', 'tag', 'tagHi', 'ctaLabel', 'ctaLabelHi', 'image'].map((k) => [k, str(k)])),
    type: s.target?.type || 'none',
    ref: s.target?.ref || '',
    language: s.language || 'all',
    start: isoToDayKey(s.startsAt),
    end: isoToDayKey(s.endsAt),
    enabled: s.enabled !== false,
  };
}

/** Field -> message for everything the contract refuses. `{}` means valid. */
export function validateSlide(d) {
  const e = {};
  const len = (key, label, max) => {
    if (String(d[key] || '').trim().length > max) e[key] = `${label} is at most ${max} characters.`;
  };
  if (!String(d.title || '').trim()) e.title = 'A title is required.';
  len('title', 'Title', LIMITS.title);
  len('titleHi', 'Title', LIMITS.title);
  len('subtitle', 'Subtitle', LIMITS.subtitle);
  len('subtitleHi', 'Subtitle', LIMITS.subtitle);
  len('tag', 'Tag', LIMITS.tag);
  len('tagHi', 'Tag', LIMITS.tag);
  len('ctaLabel', 'Button text', LIMITS.ctaLabel);
  len('ctaLabelHi', 'Button text', LIMITS.ctaLabel);
  if (!typeOf(d.type)) e.type = 'Pick where the slide opens.';
  else if (needsRef(d.type)) {
    const ref = String(d.ref || '').trim();
    if (!ref) e.ref = d.type === 'link' ? 'Enter the link.' : 'Pick one.';
    else if (d.type === 'link' && !isHttpsUrl(ref)) e.ref = 'Links must start with https://';
  }
  if (d.start && d.end && d.end < d.start) e.end = 'The end date is before the start date.';
  return e;
}

/** The editor's draft -> the body for POST/PUT /content/hero. */
export function toBody(d, { slug, order } = {}) {
  const t = (k) => String(d[k] || '').trim();
  const body = {
    tag: t('tag'), tagHi: t('tagHi'), title: t('title'), titleHi: t('titleHi'),
    subtitle: t('subtitle'), subtitleHi: t('subtitleHi'), ctaLabel: t('ctaLabel'), ctaLabelHi: t('ctaLabelHi'),
    image: d.image || '',
    target: { type: d.type, ref: needsRef(d.type) ? t('ref') : '' },
    language: d.language || 'all',
    startsAt: d.start ? startOfDayIso(d.start) : null,
    endsAt: d.end ? endOfDayIso(d.end) : null,
    enabled: !!d.enabled,
  };
  if (slug) body.slug = slug;
  if (order != null) body.order = order;
  return body;
}

/** A dashboard-only name for a new slide: "navratri-maha-durga-4k2x". */
export function newSlug(title, rand = Math.random) {
  const base = String(title || 'slide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'slide';
  return `${base}-${rand().toString(36).slice(2, 6).padEnd(4, '0')}`;
}

/**
 * Where the slide is, relative to `now`, from `enabled` and its window:
 * off | live | upcoming (starts later) | ended. A label for each.
 */
export function slideStatus(s, now = new Date()) {
  if (s.enabled === false) return { key: 'off', label: 'Off', tone: 'neutral' };
  const t = now.getTime();
  const starts = s.startsAt ? new Date(s.startsAt) : null;
  const ends = s.endsAt ? new Date(s.endsAt) : null;
  if (starts && !Number.isNaN(starts.getTime()) && starts.getTime() > t) return { key: 'upcoming', label: `Starts ${formatDay(s.startsAt)}`, tone: 'info' };
  if (ends && !Number.isNaN(ends.getTime()) && ends.getTime() < t) return { key: 'ended', label: `Ended ${formatDay(s.endsAt)}`, tone: 'neutral' };
  return { key: 'live', label: 'Live', tone: 'success' };
}

/** "5 Oct – 19 Oct", "From 5 Oct", "Until 19 Oct", "Always". */
export function scheduleLabel(s) {
  if (s.startsAt && s.endsAt) return `${formatDay(s.startsAt)} – ${formatDay(s.endsAt)}`;
  if (s.startsAt) return `From ${formatDay(s.startsAt)}`;
  if (s.endsAt) return `Until ${formatDay(s.endsAt)}`;
  return 'Always';
}

/** The "Opens" column: "Pooja · Navratri Durga", "Astrologer list", "Web link · example.com". */
export function targetLabel(target, names = {}, href = '') {
  if (!target) return href ? `Route · ${href}` : 'Nothing';
  const { type, ref } = target;
  const name = (kind) => names[kind]?.[ref] || ref || '—';
  switch (type) {
    case 'pooja': return `Pooja · ${name('poojas')}`;
    case 'chadhava': return `Chadhava · ${name('listings')}`;
    case 'temple': return `Temple · ${name('temples')}`;
    case 'bhajan': return 'Bhajan';
    case 'astrologer': return 'Astrologer list';
    case 'coins': return 'Add coins';
    case 'link': {
      try { return `Web link · ${new URL(ref).hostname}`; } catch { return 'Web link'; }
    }
    default: return 'Nothing';
  }
}

/** The gradient behind a slide with no image, by what it opens. */
const TONES = {
  pooja: ['#8A2A12', '#F6C46B'],
  astrologer: ['#24184A', '#9A5AA0'],
  chadhava: ['#7A1C2A', '#F6C46B'],
  coins: ['#9A6A12', '#F6D27A'],
  temple: ['#3A2A24', '#E3A15B'],
  bhajan: ['#0F4A3A', '#7FC8A9'],
  link: ['#1F3A5F', '#8FB4E3'],
};
export function toneGradient(type) {
  const [a, b] = TONES[type] || ['#3A2A24', '#E3A15B'];
  return `linear-gradient(120deg, ${a}, ${b})`;
}

/** Same order as the server: `order` ascending, then as listed. */
export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
