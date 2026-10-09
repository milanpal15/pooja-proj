import { useRef } from 'react';

import { api } from '../../../lib/api/index.js';
import { useUpload } from '../../../lib/hooks/useUpload.js';
import { Button, Field } from '../../../ui/index.js';
import { SOURCE_TYPES } from '../lib/live.js';
import { AartiEditor } from './AartiEditor.jsx';
import { SourceCheck } from './SourceCheck.jsx';

const Block = ({ title, children }) => (
  <section className="hs-block">
    <h3 className="hs-block__title">{title}</h3>
    {children}
  </section>
);

/** Every editable field of a stream. Controlled by the editor hook. */
export function StreamForm({ draft, set, errors, lookups, stream, taken }) {
  const fileRef = useRef(null);
  const { busy, upload } = useUpload();
  const choose = async (file) => {
    const url = await upload(file, 'image');
    if (url) set({ cover: url });
  };
  const withStored = (list, slug, label) =>
    slug && !list.some((r) => r.slug === slug) ? <option value={slug}>{slug}</option> : null;

  return (
    <div className="hs-form">
      <Block title="Temple">
        <Field label="Temple" type="select" value={draft.templeSlug} error={errors.templeSlug} onChange={(v) => set({ templeSlug: v })}>
          <option value="">Select a temple…</option>
          {lookups.temples.map((t) => (
            <option key={t.slug} value={t.slug} disabled={taken.includes(t.slug)}>
              {t.name}{taken.includes(t.slug) ? ' (already has a stream)' : ''}
            </option>
          ))}
          {withStored(lookups.temples, draft.templeSlug)}
        </Field>
        <div className="hs-pair">
          <Field label="Category" type="select" value={draft.categorySlug} onChange={(v) => set({ categorySlug: v })}>
            <option value="">None</option>
            {lookups.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            {withStored(lookups.categories, draft.categorySlug)}
          </Field>
          <Field label="Jai button text" placeholder="Jai" value={draft.jaiText} error={errors.jaiText} onChange={(v) => set({ jaiText: v })} />
        </div>
        <Field label="Jai button text (Hindi)" placeholder="जय" value={draft.jaiTextHi} error={errors.jaiTextHi} onChange={(v) => set({ jaiTextHi: v })} />
      </Block>

      <Block title="Stream source">
        <div className="lv-source">
          <Field label="Type" type="select" value={draft.sourceType} options={SOURCE_TYPES} onChange={(v) => set({ sourceType: v })} />
          <Field label="Link" type="url" placeholder={draft.sourceType === 'hls' ? 'https://…/stream.m3u8' : 'https://youtube.com/watch?v=…'} value={draft.url} error={errors.url} onChange={(v) => set({ url: v })} />
        </div>
        <SourceCheck key={stream ? stream.id ?? stream._id : 'new'} sourceType={draft.sourceType} url={draft.url} savedCheckedAt={stream?.checkedAt} savedNote={stream?.verified === false ? stream?.probeNote : ''} />
        <div className="hs-upload">
          {draft.cover && <span className="lv-cover" style={{ backgroundImage: `url("${api.asset(draft.cover)}")` }} role="img" aria-label="Cover image" />}
          <Button variant="outline" loading={busy === 'image'} onClick={() => fileRef.current?.click()}>
            {draft.cover ? 'Replace cover image' : 'Upload cover image'}
          </Button>
          {draft.cover && <Button variant="outline" onClick={() => set({ cover: '' })}>Remove</Button>}
          <span className="hs-upload__hint">Shown when offline · 1280 × 720</span>
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

      <Block title="Aarti schedule">
        <AartiEditor aartis={draft.aartis} onChange={(aartis) => set({ aartis })} error={errors.aartis} />
      </Block>

      <Block title="Shown with the stream">
        <Field label="Chadhava listing" type="select" value={draft.chadhavaListingSlug} onChange={(v) => set({ chadhavaListingSlug: v })}>
          <option value="">None</option>
          {lookups.listings.map((l) => <option key={l.slug} value={l.slug}>{l.title}</option>)}
          {withStored(lookups.listings, draft.chadhavaListingSlug)}
        </Field>
        <Field label="Pooja to suggest" type="select" value={draft.poojaSlug} onChange={(v) => set({ poojaSlug: v })}>
          <option value="">None</option>
          {lookups.poojas.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          {withStored(lookups.poojas, draft.poojaSlug)}
        </Field>
      </Block>
    </div>
  );
}
