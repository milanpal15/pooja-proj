import { useUpload } from '../../../lib/hooks/useUpload.js';
import { Button } from '../../../ui/index.js';
import { blankItem, itemFieldsFor, sourceOf } from '../lib/sources.js';
import { ItemCard } from './ItemCard.jsx';

/** The items of a section as a list of cards, with add / reorder / remove and image upload. */
export function ItemsEditor({ section, error, onChange }) {
  const { busy, upload } = useUpload();
  const items = section.items;
  const fields = itemFieldsFor(section);
  const noun = sourceOf(section).noun || 'item';

  const set = (i, key, value) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  const move = (i, d) => {
    const next = items.slice();
    next.splice(i + d, 0, next.splice(i, 1)[0]);
    onChange(next);
  };
  const onFile = async (i, file) => {
    const url = await upload(file, `item-${i}`);
    if (url) set(i, 'image', url);
  };

  return (
    <div className="hl-items">
      <ul className="hl-items__list" aria-label="Items">
        {items.map((it, i) => (
          <ItemCard
            key={i}
            index={i}
            count={items.length}
            item={it}
            fields={fields}
            uploading={busy === `item-${i}`}
            onChange={(k, v) => set(i, k, v)}
            onFile={(f) => onFile(i, f)}
            onMove={(d) => move(i, d)}
            onRemove={() => onChange(items.filter((_, j) => j !== i))}
          />
        ))}
      </ul>
      {error && (
        <p className="ui-field__error" role="alert">
          {error}
        </p>
      )}
      <Button variant="outline" onClick={() => onChange([...items, blankItem()])}>
        + Add {noun}
      </Button>
      <p className="ui-field__hint">Each item takes an uploaded image (JPG/PNG/WebP) where the layout shows one. With none, the tile shows a toned ground and its title.</p>
    </div>
  );
}
