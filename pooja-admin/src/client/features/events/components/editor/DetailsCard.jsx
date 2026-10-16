import { Card, Field, Switch } from '../../../../ui/index.js';
import { LANGUAGES } from '../../lib/events.js';
import { CoverField } from './CoverField.jsx';
import { useEd } from './EditorContext.js';

/** The event itself: type, titles, summary, cover, language, and whether the app shows it. */
export function DetailsCard() {
  const { d, set, chooseType, lookups, isNew, ro, dis, err } = useEd();
  const stored = d.typeSlug && !lookups.types.some((t) => t.slug === d.typeSlug);
  return (
    <Card title="Event">
      <div className="hs-form">
        <div className="hs-pair">
          <Field label="Event type" type="select" value={d.typeSlug} error={err('typeSlug')} onChange={chooseType} {...dis}>
            <option value="">Choose a type…</option>
            {lookups.types.filter((t) => t.enabled !== false || t.slug === d.typeSlug).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            {stored && <option value={d.typeSlug}>{d.typeSlug}</option>}
          </Field>
          <Field label="Language" type="select" value={d.language} options={LANGUAGES} onChange={(v) => set({ language: v })} {...dis} />
        </div>
        {isNew && !ro && <p className="ui-field__hint">Choosing a type fills in the sections that kind of event usually has. You can change all of it.</p>}
        <Field label="Title (English)" value={d.title} error={err('title') || err('slug')} onChange={(v) => set({ title: v })} {...dis} />
        <Field label="Title (Hindi)" value={d.titleHi} error={err('titleHi')} onChange={(v) => set({ titleHi: v })} {...dis} />
        <Field label="Short description" value={d.summary} error={err('summary')} onChange={(v) => set({ summary: v })} {...dis} />
        <Field label="Short description (Hindi)" value={d.summaryHi} onChange={(v) => set({ summaryHi: v })} {...dis} />
        <CoverField value={d.cover} onChange={(v) => set({ cover: v })} hint="Cover image · 1080 × 600" disabled={ro} />
        <Field label="Colour" hint="Optional. Falls back to the type’s colour." placeholder="#af101a" value={d.color} error={err('theme.color')} onChange={(v) => set({ color: v })} {...dis} />
        <Switch variant="card" label="Shown in the app" hint="Needs a schedule and valid fields" checked={d.published} onChange={(v) => set({ published: v })} {...dis} />
        {err('blocks') && <p className="ui-field__error">{err('blocks')}</p>}
      </div>
    </Card>
  );
}
