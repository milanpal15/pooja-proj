import { Button, IconButton } from './Button.jsx';
import { Field } from './Field.jsx';

/**
 * An editable list of small records (benefits, FAQs, steps): one card each
 * with its fields, move up / down and remove, and an add button.
 *
 * @typedef {Object} RepeatListProps
 * @property {string} noun                      "benefit" — used in labels
 * @property {Array<object>} items
 * @property {(items: Array<object>) => void} onChange
 * @property {Array<{key: string, label: string, multiline?: boolean}>} fields   laid out two per row
 * @property {() => object} blank               a new empty record
 */
export function RepeatList({ noun, items, onChange, fields, blank }) {
  const set = (i, key, value) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  const move = (i, d) => {
    const next = items.slice();
    next.splice(i + d, 0, next.splice(i, 1)[0]);
    onChange(next);
  };
  return (
    <div className="ui-repeat">
      <ul className="ui-repeat__list" aria-label={`${noun}s`}>
        {items.map((it, i) => (
          <li key={i} className="ui-repeat__item">
            <div className="ui-repeat__head">
              <b>
                {noun[0].toUpperCase() + noun.slice(1)} {i + 1}
              </b>
              <span className="ui-repeat__tools">
                <IconButton label={`Move ${noun} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </IconButton>
                <IconButton label={`Move ${noun} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </IconButton>
                <Button variant="danger" size="sm" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </span>
            </div>
            <div className="ui-repeat__grid">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} type={f.multiline ? 'textarea' : 'text'} rows={f.multiline ? 3 : undefined} value={it[f.key]} onChange={(v) => set(i, f.key, v)} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" onClick={() => onChange([...items, blank()])}>
        + Add {noun}
      </Button>
    </div>
  );
}
