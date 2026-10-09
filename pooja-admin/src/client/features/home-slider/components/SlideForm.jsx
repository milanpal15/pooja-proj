import { useRef } from 'react';

import { useUpload } from '../../../lib/hooks/useUpload.js';
import { Accordion, Button, Field } from '../../../ui/index.js';
import { LANGUAGES, TARGET_TYPES, needsRef, refKindOf } from '../lib/slide.js';
import { SlidePreview } from './SlidePreview.jsx';

const Block = ({ title, children }) => (
  <section className="hs-block">
    <h3 className="hs-block__title">{title}</h3>
    {children}
  </section>
);

/** Preview + every editable field. Controlled by the editor hook (`draft`, `set`, `errors`). */
export function SlideForm({ draft, set, errors, targets }) {
  const fileRef = useRef(null);
  const { busy, upload } = useUpload();
  const ref = needsRef(draft.type);
  const kind = refKindOf(draft.type);
  const refLabel = TARGET_TYPES.find((t) => t.value === draft.type)?.refLabel;
  const text = (key, label) => <Field label={label} value={draft[key]} onChange={(v) => set({ [key]: v })} error={errors[key]} />;

  const choose = async (file) => {
    const url = await upload(file, 'image');
    if (url) set({ image: url });
  };

  return (
    <div className="hs-form">
      <Block title="Preview">
        <SlidePreview draft={draft} />
        <div className="hs-upload">
          <Button variant="outline" loading={busy === 'image'} onClick={() => fileRef.current?.click()}>
            {draft.image ? 'Replace image' : 'Upload image'}
          </Button>
          {draft.image && (
            <Button variant="outline" onClick={() => set({ image: '' })}>
              Remove
            </Button>
          )}
          <span className="hs-upload__hint">1080 × 520 px · JPG or PNG</span>
          <input
            ref={fileRef}
            type="file"
            tabIndex={-1}
            aria-hidden="true"
            className="ui-filefield__input"
            accept="image/jpeg,image/png"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) choose(f);
            }}
          />
        </div>
      </Block>

      <Block title="Content">
        {text('title', 'Title')}
        {text('subtitle', 'Subtitle')}
        <div className="hs-pair">
          {text('tag', 'Tag')}
          {text('ctaLabel', 'Button text')}
        </div>
        <Accordion title="Hindi" summary="Title, subtitle, tag, button">
          <div className="hs-hindi">
            {text('titleHi', 'Title (Hindi)')}
            {text('subtitleHi', 'Subtitle (Hindi)')}
            <div className="hs-pair">
              {text('tagHi', 'Tag (Hindi)')}
              {text('ctaLabelHi', 'Button text (Hindi)')}
            </div>
          </div>
        </Accordion>
      </Block>

      <Block title="Opens">
        <div className="hs-pair">
          <Field label="Goes to" type="select" value={draft.type} options={TARGET_TYPES} error={errors.type} onChange={(v) => set({ type: v, ref: '' })} />
          {ref && kind && (
            <Field label={refLabel} type="select" value={draft.ref} error={errors.ref} onChange={(v) => set({ ref: v })}>
              <option value="">Select…</option>
              {targets.options[kind].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {draft.ref && !targets.options[kind].some((o) => o.value === draft.ref) && <option value={draft.ref}>{draft.ref}</option>}
            </Field>
          )}
        </div>
        {draft.type === 'link' && <Field label={refLabel} type="url" placeholder="https://" value={draft.ref} error={errors.ref} onChange={(v) => set({ ref: v })} />}
      </Block>

      <Block title="Schedule and audience">
        <div className="hs-pair">
          <Field label="Start" type="date" value={draft.start} onChange={(v) => set({ start: v })} />
          <Field label="End" type="date" value={draft.end} error={errors.end} onChange={(v) => set({ end: v })} />
        </div>
        <Field label="Language" type="select" value={draft.language} options={LANGUAGES} onChange={(v) => set({ language: v })} />
      </Block>
    </div>
  );
}
