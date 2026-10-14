import sanitizeHtml from 'sanitize-html';

/**
 * The one HTML cleaner for operator-written Home banners (docs/POOJA_AND_HOME.md §1.3).
 *
 * The dashboard lets an editor write markup that the phone renders inside the
 * app, so what is stored is treated as hostile: it is cleaned when it is saved
 * AND again when it is served, so a row written by any other route (or by hand
 * in the database) can never reach a device raw.
 *
 * An allowlist, never a denylist: anything not named here is dropped.
 */

export const MAX_HTML_BYTES = 20 * 1024;

const TAGS = ['div', 'span', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'b', 'strong', 'i', 'em', 'u', 'a', 'img', 'ul', 'ol', 'li', 'small'];

const STYLE_PROPS = [
  'color', 'background-color', 'font-size', 'font-weight', 'text-align', 'padding', 'margin', 'border-radius',
  'line-height', 'letter-spacing', 'border', 'display', 'width', 'height', 'max-width',
];

/** A CSS value: plain tokens only. No functions that fetch or compute (url, expression, var…), no escapes, no comments. */
const SAFE_VALUE = /^(?!.*(?:url|expression|javascript|behaviou?r|import|var|calc|attr|env|image-set)\s*\()(?!.*[\\/*])[\w\s#.,%()+\-!]*$/i;

const allowedStyles = { '*': Object.fromEntries(STYLE_PROPS.map((p) => [p, [SAFE_VALUE]])) };

/** In-app link, https URL, or a `/route`. Nothing else (no `//host`, no `javascript:`, no `data:`). */
const okHref = (v) => /^(bhakti:\/\/[\w\-./?=&%#]*|https:\/\/[^\s"'<>]+|\/(?!\/)[\w\-./?=&%#]*)$/i.test(v);
/** Uploaded media or an https image. */
const okSrc = (v) => /^(\/uploads\/[\w\-./%]+|https:\/\/[^\s"'<>]+)$/i.test(v);

const OPTIONS = {
  allowedTags: TAGS,
  allowedAttributes: {
    '*': ['class', 'style'],
    a: ['href', 'class', 'style'],
    img: ['src', 'alt', 'width', 'height', 'class', 'style'],
  },
  allowedStyles,
  allowedSchemes: ['https', 'bhakti'],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // Applied to the open tag before the attribute allowlist, so a bad link or
  // source is removed (and an <img> with no valid source is dropped below).
  transformTags: {
    a: (tag, attribs) => {
      const next = { ...attribs };
      if (next.href !== undefined && !okHref(String(next.href).trim())) delete next.href;
      else if (next.href !== undefined) next.href = String(next.href).trim();
      return { tagName: 'a', attribs: next };
    },
    img: (tag, attribs) => {
      const next = { ...attribs };
      if (next.src !== undefined && !okSrc(String(next.src).trim())) delete next.src;
      else if (next.src !== undefined) next.src = String(next.src).trim();
      return { tagName: 'img', attribs: next };
    },
  },
  // An image that lost its source renders as a broken box; drop it.
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

/** Clean a fragment. Always returns a string; non-strings become ''. */
export function sanitizeHtmlFragment(html) {
  if (typeof html !== 'string' || !html) return '';
  return sanitizeHtml(html, OPTIONS).trim();
}

/** True when the raw input is within the size cap (bytes, not characters). */
export const withinHtmlLimit = (html) => Buffer.byteLength(String(html ?? ''), 'utf8') <= MAX_HTML_BYTES;
