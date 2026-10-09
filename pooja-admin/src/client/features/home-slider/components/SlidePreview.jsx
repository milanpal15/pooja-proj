import { api } from '../../../lib/api/index.js';
import { toneGradient } from '../lib/slide.js';

/** The slide as the app draws it: 330:160 card, scrim over the image or a toned gradient, tag, title, subtitle, button. */
export function SlidePreview({ draft }) {
  const bg = draft.image ? `url("${api.asset(draft.image)}") center / cover` : toneGradient(draft.type);
  return (
    <div className="hs-preview" role="img" aria-label={`Preview: ${draft.title || 'untitled slide'}`}>
      <div className="hs-preview__bg" style={{ background: bg }} />
      <div className="hs-preview__scrim" />
      <div className="hs-preview__text">
        {draft.tag && <span className="hs-preview__tag">{draft.tag}</span>}
        <b className="hs-preview__title">{draft.title || 'Slide title'}</b>
        {draft.subtitle && <span className="hs-preview__sub">{draft.subtitle}</span>}
        {draft.ctaLabel && <span className="hs-preview__btn">{draft.ctaLabel} ›</span>}
      </div>
    </div>
  );
}
