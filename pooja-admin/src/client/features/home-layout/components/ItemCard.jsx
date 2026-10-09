import { api } from '../../../lib/api/index.js';
import { Button, Field, IconButton, ThumbPick } from '../../../ui/index.js';
import { BADGES, FLAGS, ICONS } from '../lib/sources.js';

const LABEL = { image: 'Image', title: 'Title (EN)', titleHi: 'Title (HI)', subtitle: 'Subtitle (EN)', subtitleHi: 'Subtitle (HI)', href: 'Opens (route)', badge: 'Badge', icon: 'Icon', flag: 'Only while flag is on' };
const options = (list) => [{ value: '', label: 'None' }, ...list.map((v) => ({ value: v, label: v }))];

/** One item of a section: its fields (the block's layout decides which), and move / remove. */
export function ItemCard({ index, count, item, fields, uploading, onChange, onFile, onMove, onRemove }) {
  const n = index + 1;
  const cell = (name) => {
    if (name === 'image') {
      return (
        <div key={name} className="ui-field">
          <span className="ui-field__label">{LABEL.image}</span>
          <ThumbPick label={`item ${n} image`} src={item.image ? api.asset(item.image) : ''} uploading={uploading} onFile={onFile} onClear={() => onChange('image', '')} />
        </div>
      );
    }
    const common = { key: name, label: LABEL[name], value: item[name], onChange: (v) => onChange(name, v) };
    if (name === 'badge') return <Field {...common} type="select" options={BADGES} />;
    if (name === 'icon') return <Field {...common} type="select" options={options(ICONS)} />;
    if (name === 'flag') return <Field {...common} type="select" options={options(FLAGS)} />;
    return <Field {...common} />;
  };
  return (
    <li className="hl-item">
      <div className="hl-item__head">
        <b>Item {n}</b>
        <span className="hl-item__tools">
          <IconButton label={`Move item ${n} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label={`Move item ${n} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            ↓
          </IconButton>
          <Button variant="danger" size="sm" aria-label={`Remove item ${n}`} onClick={onRemove}>
            Remove
          </Button>
        </span>
      </div>
      <div className="hl-item__grid">{[...fields.main, ...fields.more].map(cell)}</div>
    </li>
  );
}
