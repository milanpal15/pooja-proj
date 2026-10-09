import DOMPurify from 'dompurify';

/**
 * The dashboard's copy of the server's HTML allowlist (docs/POOJA_AND_HOME.md
 * §1.3), used ONLY to draw the live preview. The server cleans again on save —
 * and on read — and its answer is what the phone shows; this exists so an
 * operator sees roughly what survives while they type. Keep the lists in step.
 */
const TAGS = ['div', 'span', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'b', 'strong', 'i', 'em', 'u', 'a', 'img', 'ul', 'ol', 'li', 'small'];
const ATTRS = ['class', 'style', 'href', 'src', 'alt', 'width', 'height'];
const STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'text-align',
  'padding',
  'margin',
  'border-radius',
  'line-height',
  'letter-spacing',
  'border',
  'display',
  'width',
  'height',
  'max-width',
]);
const HREF_OK = /^(bhakti:\/\/\S+|https:\/\/\S+|\/(?!\/)\S*)$/i;
const SRC_OK = /^(\/uploads\/\S+|https:\/\/\S+)$/i;
const STYLE_BAD = /url\(|expression|javascript:|@import|\\|<|>/i;

/** Keep only allowlisted declarations of a style attribute. */
export function cleanStyle(style) {
  return String(style || '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      const i = d.indexOf(':');
      if (i < 1) return false;
      return STYLE_PROPS.has(d.slice(0, i).trim().toLowerCase()) && !STYLE_BAD.test(d.slice(i + 1));
    })
    .join('; ');
}

let purify;
function instance() {
  if (purify) return purify;
  purify = DOMPurify(window);
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    const tag = node.nodeName.toLowerCase();
    const name = data.attrName;
    if (name === 'style') {
      data.attrValue = cleanStyle(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    } else if (name === 'href') {
      if (tag !== 'a' || !HREF_OK.test(data.attrValue.trim())) data.keepAttr = false;
    } else if (name === 'src') {
      if (tag !== 'img' || !SRC_OK.test(data.attrValue.trim())) data.keepAttr = false;
    } else if (['alt', 'width', 'height'].includes(name) && tag !== 'img') {
      data.keepAttr = false;
    }
  });
  return purify;
}

/** Cleaned HTML, or '' for nothing. Scripts, iframes, forms, handlers, <style> and odd URLs are dropped. */
export function sanitizeHtml(html) {
  if (!html || !String(html).trim()) return '';
  return instance().sanitize(String(html), {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:bhakti:|https:|\/)/i,
  });
}
