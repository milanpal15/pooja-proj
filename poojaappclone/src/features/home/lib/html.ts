/**
 * Plumbing for the HTML hero slides. The HTML is sanitised by the API, and this
 * is the second wall: no JavaScript, a CSP that allows only images and inline
 * styles, and every navigation intercepted by the caller.
 */

/** `https://host:port` of an absolute URL, or '' when it is not one. */
export function originOf(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return m ? m[1] : '';
}

/**
 * Make host-relative uploads absolute. The page is loaded with no base URL, so
 * `<img src="/uploads/x.jpg">` would resolve against nothing.
 */
export function rewriteUploads(html: string, apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '');
  return html.replace(/(\ssrc\s*=\s*)(["'])\/uploads\//gi, (_m, pre, q) => `${pre}${q}${base}/uploads/`);
}

/** A minimal document around the fragment, with a restrictive CSP. */
export function wrapHtml(fragment: string, apiBase: string): string {
  const origin = originOf(apiBase);
  const csp = `default-src 'none'; img-src https: ${origin}; style-src 'unsafe-inline'`.replace(/ ;/g, ';');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>html,body{margin:0;padding:0;overflow:hidden;font-family:sans-serif}' +
    'img{max-width:100%}</style></head><body>' +
    `${fragment}</body></html>`
  );
}

/** What a WebView navigation should do. `load` is only the initial about:blank document. */
export type NavAction = 'load' | 'route' | 'external' | 'block';

export function classifyNavigation(url: string): NavAction {
  if (url === 'about:blank') return 'load';
  if (/^bhakti:\/\//i.test(url)) return 'route';
  if (/^https:\/\//i.test(url)) return 'external';
  return 'block';
}
