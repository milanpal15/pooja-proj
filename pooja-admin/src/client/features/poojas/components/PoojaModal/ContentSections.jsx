import { api } from '../../../../lib/api/index.js';
import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Accordion, Field, RepeatList, ThumbPick } from '../../../../ui/index.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Each repeatable section: its stored key, a blank record and the fields (laid out two per row, EN then HI).
const LISTS = [
  { key: 'benefits', title: 'Benefits', noun: 'benefit', one: 'item', many: 'items', blank: { title: '', titleHi: '', text: '', textHi: '' }, fields: [['title', 'Title (English)'], ['titleHi', 'Title (Hindi)'], ['text', 'Text (English)', true], ['textHi', 'Text (Hindi)', true]] },
  { key: 'included', title: 'What is included', noun: 'item', one: 'item', many: 'items', blank: { text: '', textHi: '' }, fields: [['text', 'Text (English)'], ['textHi', 'Text (Hindi)']] },
  { key: 'process', title: 'Pooja process', noun: 'step', one: 'step', many: 'steps', blank: { title: '', titleHi: '', text: '', textHi: '' }, fields: [['title', 'Title (English)'], ['titleHi', 'Title (Hindi)'], ['text', 'Text (English)', true], ['textHi', 'Text (Hindi)', true]] },
  { key: 'faqs', title: 'FAQs', noun: 'question', one: 'question', many: 'questions', blank: { q: '', qHi: '', a: '', aHi: '' }, fields: [['q', 'Question (English)'], ['qHi', 'Question (Hindi)'], ['a', 'Answer (English)', true], ['aHi', 'Answer (Hindi)', true]] },
];

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/** About, benefits, included, process, temple override and FAQs — each an accordion with English and Hindi fields. */
export function ContentSections({ draft, set }) {
  const { busy, upload } = useUpload();
  const aboutWords = words(draft.about) + words(draft.aboutHi);
  const onTempleImage = async (file) => {
    const url = await upload(file, 'temple');
    if (url) set('templeImage', url);
  };
  const lists = (key) => LISTS.find((l) => l.key === key);
  const renderList = (l) => (
    <Accordion key={l.key} title={l.title} summary={plural(draft[l.key].length, l.one, l.many)}>
      <RepeatList noun={l.noun} items={draft[l.key]} onChange={(v) => set(l.key, v)} blank={() => ({ ...l.blank })} fields={l.fields.map(([key, label, multiline]) => ({ key, label, multiline }))} />
    </Accordion>
  );
  return (
    <div className="pj-sections">
      <Accordion title="About this pooja" summary={aboutWords ? `English · Hindi · ${aboutWords} words` : 'Empty'}>
        <Field type="textarea" rows={5} label="About (English)" value={draft.about} onChange={(v) => set('about', v)} />
        <Field type="textarea" rows={5} label="About (Hindi)" value={draft.aboutHi} onChange={(v) => set('aboutHi', v)} />
      </Accordion>
      {renderList(lists('benefits'))}
      {renderList(lists('included'))}
      {renderList(lists('process'))}
      <Accordion title="About the temple" summary="Taken from Temples; override here">
        <Field type="textarea" rows={4} label="Temple description (English)" hint="Leave empty to use the temple’s own" value={draft.templeAbout} onChange={(v) => set('templeAbout', v)} />
        <Field type="textarea" rows={4} label="Temple description (Hindi)" value={draft.templeAboutHi} onChange={(v) => set('templeAboutHi', v)} />
        <div className="ui-field">
          <span className="ui-field__label">Temple image</span>
          <ThumbPick label="temple image" src={draft.templeImage ? api.asset(draft.templeImage) : ''} uploading={busy === 'temple'} onFile={onTempleImage} onClear={() => set('templeImage', '')} />
        </div>
      </Accordion>
      {renderList(lists('faqs'))}
    </div>
  );
}
