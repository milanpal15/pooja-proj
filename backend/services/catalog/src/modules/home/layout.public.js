import { etagMatches, jsonEtag } from '@bhakti/common';

import { asyncRouter } from '../../lib/async-handler.js';
import { inWindow } from '../../lib/window.js';
import { heroHref } from '../content/resources/hero-target.js';
import { sanitizeHtmlFragment } from './html-sanitizer.js';
import { DEFAULT_LAYOUT_ID } from './registry.js';
import { asV2, ensureLayout } from './layout.store.js';

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

const iso = (d) => new Date(d).toISOString();

/** An item survives unless it is hidden in this layout (`enabled:false`); the rest get an `href`. */
const itemView = (i) => ({ ...i, action: withHref(i.action), href: resolveAction(i.action) });

function blockView(b) {
  const out = { ...b, action: withHref(b.action) };
  if (out.props && typeof out.props === 'object') {
    out.props = { ...out.props };
    for (const k of ['html', 'htmlHi']) if (k in out.props) out.props[k] = sanitizeHtmlFragment(out.props[k]);
  }
  if (out.data?.mode === 'inline') out.data = { ...out.data, items: out.data.items.filter((i) => i.enabled !== false).map(itemView) };
  return out;
}

const layoutView = (l, { lang, now }) => ({
  id: l.id, name: l.name, audience: l.audience ?? [], startsAt: l.startsAt ?? null, endsAt: l.endsAt ?? null,
  // Per-block filters (section 4): enabled, window, language. NOT audience: the device decides that (section 9.1).
  blocks: (l.blocks ?? [])
    .filter((b) => b.enabled !== false && inWindow(b, now) && (!lang || !b.language || b.language === 'all' || b.language === lang))
    .map(blockView),
});

/**
 * The body of `GET /public/home` (section 9.2): the enabled layouts whose schedule contains NOW, in priority (array) order,
 * with `default` always present and always last. Audiences are left for the device to evaluate.
 */
export function publicLayoutView(live, { lang, now = new Date() } = {}) {
  const l = lang === 'en' || lang === 'hi' ? lang : null;
  const all = asV2(live).layouts ?? [];
  const ctx = { lang: l, now };
  const eligible = all.filter((x) => x.id !== DEFAULT_LAYOUT_ID && x.enabled !== false && inWindow(x, now));
  const fallback = all.find((x) => x.id === DEFAULT_LAYOUT_ID);
  const layouts = [...eligible, ...(fallback ? [{ ...fallback, audience: [], startsAt: null, endsAt: null }] : [])].map((x) => layoutView(x, ctx));
  return { version: live.version, schemaVersion: 2, publishedAt: iso(live.publishedAt), layouts };
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
