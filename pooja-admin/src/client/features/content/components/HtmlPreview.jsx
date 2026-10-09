import { api } from '../../../lib/api/index.js';
import { sanitizeHtml } from '../lib/sanitize-html.js';

const FRAME_CSP = "default-src 'none'; img-src https: http:; style-src 'unsafe-inline'";

/** The srcdoc for the preview: cleaned markup, uploaded images resolved to the API host, no script allowed anywhere. */
export function previewDoc(html) {
  const clean = sanitizeHtml(html).replace(/src="\/uploads\//g, `src="${api.asset('/uploads/')}`);
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:system-ui,'Noto Sans Devanagari',sans-serif}</style>${clean}`;
}

/**
 * The slide as the phone draws it: sanitised, in a locked-down frame (`sandbox`
 * with no tokens = no scripts, no forms, no navigation) at a fixed 16:9.
 */
export function HtmlPreview({ html, title }) {
  return (
    <div className="html-preview">
      {html && html.trim() ? (
        <iframe className="html-preview__frame" sandbox="" title={title} srcDoc={previewDoc(html)} />
      ) : (
        <p className="html-preview__empty">Nothing to preview yet</p>
      )}
    </div>
  );
}
