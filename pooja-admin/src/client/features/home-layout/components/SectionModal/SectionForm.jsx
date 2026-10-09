import { Field, Segmented, Switch } from '../../../../ui/index.js';
import { LAYOUTS, sourceOf } from '../../lib/sources.js';
import { DeityPicker } from '../DeityPicker.jsx';
import { ItemsEditor } from '../ItemsEditor.jsx';
import { ScheduleFields } from '../ScheduleFields.jsx';
import { ToneSwatches } from '../ToneSwatches.jsx';

/** The fields of a section. A built-in block gets the reduced form: title, band, schedule, and items only where its source uses them. */
export function SectionForm({ section, errors, set }) {
  const src = sourceOf(section);
  const custom = section.source === 'custom';
  return (
    <>
      <div className="feat-grid2 feat-grid--top">
        <Field label="Title (English)" value={section.title} error={errors.title} onChange={(v) => set('title', v)} />
        <Field label="Title (Hindi)" value={section.titleHi} onChange={(v) => set('titleHi', v)} />
      </div>
      <div className="feat-grid2 feat-grid--top">
        <div className="ui-field">
          <span className="ui-field__label">Band colour</span>
          <ToneSwatches value={section.tone} onChange={(v) => set('tone', v)} />
        </div>
        {custom && (
          <div className="ui-field">
            <span className="ui-field__label">Layout</span>
            <Segmented label="Layout" options={LAYOUTS} value={section.layout} onChange={(v) => set('layout', v)} />
          </div>
        )}
      </div>
      <ScheduleFields section={section} errors={errors} onChange={set} />
      {custom && (
        <div className="feat-grid3 feat-grid--top">
          <Field label="Footer link label (EN)" value={section.footerLabel} onChange={(v) => set('footerLabel', v)} />
          <Field label="Footer link label (HI)" value={section.footerLabelHi} onChange={(v) => set('footerLabelHi', v)} />
          <Field label="Footer opens" placeholder="/festivals" value={section.footerHref} onChange={(v) => set('footerHref', v)} />
        </div>
      )}
      {src.deities && <DeityPicker items={section.items} error={errors.items} onChange={(items) => set('items', items)} />}
      {src.items && <ItemsEditor section={section} error={errors.items} onChange={(items) => set('items', items)} />}
      <Switch variant="card" label="Visible" hint="Off drops the block from the phone, whatever its schedule" checked={!!section.enabled} onChange={(v) => set('enabled', v)} />
    </>
  );
}
