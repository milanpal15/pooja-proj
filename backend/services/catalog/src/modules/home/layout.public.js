import { etagMatches, jsonEtag } from '@bhakti/common';

import { asyncRouter } from '../../lib/async-handler.js';
import { inWindow } from '../../lib/window.js';
import { heroHref } from '../content/resources/hero-target.js';
import { sanitizeHtmlFragment } from './html-sanitizer.js';
import { ensureLayout } from './layout.store.js';

/** What an action with no ref opens (the list screen), for the types that have one. */
const INDEX = { pooja: '/poojas', temple: '/temples', chadhava: '/chadhava', event: '/events' };

/** `{type, ref}` -> the in-app route / https URL it opens, '' when it leads nowhere. Reuses the hero resolver. */
export function resolveAction(a) {
  if (!a?.type || a.type === 'none') return '';
  const ref = typeof a.ref === 'string' ? a.ref.trim() : '';
  if (!ref && INDEX[a.type]) return INDEX[a.type];
  return heroHref({ type: a.type, ref });
}

const withHref = (a) => (a ? { type: a.type, ref: a.ref ?? '', href: resolveAction(a) } : null);

function blockView(b) {
  const out = { ...b, action: withHref(b.action) };
  if (out.props && typeof out.props === 'object') {
    out.props = { ...out.props };
    for (const k of ['html', 'htmlHi']) if (k in out.props) out.props[k] = sanitizeHtmlFragment(out.props[k]);
  }
  if (out.data?.mode === 'inline') out.data = { ...out.data, items: out.data.items.map((i) => ({ ...i, action: withHref(i.action), href: resolveAction(i.action) })) };
  return out;
}

const iso = (d) => new Date(d).toISOString();

/** The body of `GET /public/home`: enabled, in-window, language-matching blocks with hrefs resolved and html cleaned again. */
export function publicLayoutView(live, { lang, now = new Date() } = {}) {
  const l = lang === 'en' || lang === 'hi' ? lang : null;
  const blocks = (live.blocks ?? [])
    .filter((b) => b.enabled !== false && inWindow(b, now) && (!l || !b.language || b.language === 'all' || b.language === l))
    .map(blockView);
  return { version: live.version, schemaVersion: live.schemaVersion ?? 1, publishedAt: iso(live.publishedAt), blocks };
}

export const layoutPublicRoutes = asyncRouter();
layoutPublicRoutes.get('/public/home', async (req, res) => {
  const live = await ensureLayout();
  const body = publicLayoutView(live, { lang: typeof req.query.lang === 'string' ? req.query.lang : undefined });
  const etag = jsonEtag(body);
  res.set('ETag', etag);
  res.set('Cache-Control', 'public, max-age=60');
  if (etagMatches(req.headers['if-none-match'], etag)) return res.status(304).end();
  res.json(body);
});
