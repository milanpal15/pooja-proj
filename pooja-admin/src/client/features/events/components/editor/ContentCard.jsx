import { useRef } from 'react';

import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Button, Card, Field, RepeatList } from '../../../../ui/index.js';
import { CoverField } from './CoverField.jsx';
import { useEd } from './EditorContext.js';

/** About text, gallery, FAQs and links. */
export function ContentCard() {
  const { d, setBlock, ro, dis } = useEd();
  const c = d.content;
  const put = (p) => setBlock('content', p);
  return (
    <Card title="Content">
      <div className="hs-form">
        <Field label="About (English)" type="textarea" rows={5} value={c.body} onChange={(v) => put({ body: v })} {...dis} />
        <Field label="About (Hindi)" type="textarea" rows={5} value={c.bodyHi} onChange={(v) => put({ bodyHi: v })} {...dis} />
        <section className="hs-block">
          <h3 className="hs-block__title">Gallery</h3>
          {c.gallery.map((g, i) => (
            <div key={i} className="ev-gal">
              <CoverField value={g} label={`Photo ${i + 1}`} onChange={(v) => put({ gallery: v ? c.gallery.map((x, j) => (j === i ? v : x)) : c.gallery.filter((_, j) => j !== i) })} disabled={ro} />
            </div>
          ))}
          {!ro && <GalleryAdd onAdd={(url) => put({ gallery: [...c.gallery, url] })} />}
        </section>
        <section className="hs-block">
          <h3 className="hs-block__title">Questions and answers</h3>
          {ro ? c.faq.map((f, i) => <p key={i}><b>{f.q}</b><br />{f.a}</p>) : (
            <RepeatList noun="question" items={c.faq} onChange={(faq) => put({ faq })} fields={[{ key: 'q', label: 'Question' }, { key: 'a', label: 'Answer', multiline: true }]} blank={() => ({ q: '', a: '' })} />
          )}
        </section>
        <section className="hs-block">
          <h3 className="hs-block__title">Links</h3>
          {ro ? c.links.map((l, i) => <p key={i}>{l.label} · {l.route}</p>) : (
            <RepeatList noun="link" items={c.links} onChange={(links) => put({ links })} fields={[{ key: 'label', label: 'Label' }, { key: 'route', label: 'Where it goes' }]} blank={() => ({ label: '', route: '' })} />
          )}
        </section>
      </div>
    </Card>
  );
}

function GalleryAdd({ onAdd }) {
  const ref = useRef(null);
  const { busy, upload } = useUpload();
  return (
    <div className="hs-upload">
      <Button variant="outline" loading={busy === 'g'} onClick={() => ref.current?.click()}>+ Add photo</Button>
      <input ref={ref} type="file" tabIndex={-1} aria-hidden="true" className="ui-filefield__input" accept="image/jpeg,image/png"
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const url = await upload(f, 'g'); if (url) onAdd(url); } }} />
    </div>
  );
}
