import { Field } from '../../../ui/index.js';
import { renderMd } from '../lib/render-md.js';

/**
 * Markdown in, Markdown out — the app renders it, so the dashboard shows a
 * preview rather than a WYSIWYG that would lie about the result.
 */
export function PolicyEditor({ title, onTitle, body, onBody, readOnly = false }) {
  if (readOnly) {
    return (
      <>
        <h2 className="md-title">{title}</h2>
        <div className="md-preview" dangerouslySetInnerHTML={{ __html: renderMd(body) }} />
      </>
    );
  }
  return (
    <>
      <Field label="Title" value={title} onChange={onTitle} />

      <div className="md-split">
        <Field label="Markdown" type="textarea" className="md-field" spellCheck value={body} onChange={onBody} />
        <div className="ui-field">
          <span className="ui-field__label">Preview — as the app renders it</span>
          <div className="md-preview" dangerouslySetInnerHTML={{ __html: renderMd(body) }} />
        </div>
      </div>

      <p className="ui-field__hint">
        Supported: headings, <b>bold</b>, <i>italic</i>, lists, links, quotes, rules and inline
        code. The app renders this same subset — anything outside it shows as plain text.
      </p>
    </>
  );
}
