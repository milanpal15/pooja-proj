import { HtmlPreview } from '../HtmlPreview.jsx';

/** A live preview of `field.source` (and its Hindi twin when there is one). Draws no input. */
export function HtmlPreviewField({ field, values }) {
  const en = values[field.source];
  const hi = values[`${field.source}Hi`];
  return (
    <div className="ui-field">
      <span className="ui-field__label">{field.label}</span>
      <div className="html-preview-row">
        <figure className="html-preview-fig">
          <HtmlPreview html={en} title="Preview, English" />
          <figcaption>English · as the phone shows it</figcaption>
        </figure>
        {hi && hi.trim() && (
          <figure className="html-preview-fig">
            <HtmlPreview html={hi} title="Preview, Hindi" />
            <figcaption>Hindi</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}
