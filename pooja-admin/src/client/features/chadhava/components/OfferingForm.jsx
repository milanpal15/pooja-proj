import { api } from '../../../lib/api/index.js';
import { Field, ThumbPick } from '../../../ui/index.js';

/** The fields of one offering — shared by the listing editor (inline) and the Offerings tab (side panel). */
export function OfferingForm({ offering: o, errors = {}, uploading, onChange, onFile }) {
  return (
    <>
      <Field label="Title (English)" value={o.title} error={errors.title} onChange={(v) => onChange({ title: v })} />
      <Field label="Title (Hindi)" value={o.titleHi} onChange={(v) => onChange({ titleHi: v })} />
      <Field type="textarea" rows={3} label="Description (English)" value={o.desc} onChange={(v) => onChange({ desc: v })} />
      <Field type="textarea" rows={3} label="Description (Hindi)" value={o.descHi} onChange={(v) => onChange({ descHi: v })} />
      <div className="feat-grid2 feat-grid--top">
        <Field type="number" min="1" label="Price (coins)" value={o.coins} error={errors.coins} onChange={(v) => onChange({ coins: v })} />
        <Field label="Label (optional)" value={o.label} placeholder="Most offered" onChange={(v) => onChange({ label: v })} />
      </div>
      <Field label="Label (Hindi)" value={o.labelHi} onChange={(v) => onChange({ labelHi: v })} />
      <div className="ui-field">
        <span className="ui-field__label">Image</span>
        <ThumbPick label="offering image" src={o.image ? api.asset(o.image) : ''} uploading={uploading} onFile={onFile} onClear={() => onChange({ image: '' })} />
      </div>
    </>
  );
}
