import { useRef } from 'react';

import { Field, Segmented } from '../../../ui/index.js';
import { blankData } from '../lib/layout.js';
import { maxItemsOf, modesOf, schemaDefaults, sourcesOf } from '../lib/registry.js';
import { useBuilder } from './BuilderContext.js';
import { ItemsEditor } from './ItemsEditor.jsx';
import { SchemaFields } from './SchemaFields.jsx';

/** Presentation only: what the board calls a grid's entries. Everything else holds cards. */
const NOUN = { quick_grid: 'tile' };
const MODE_LABEL = { inline: 'Cards written here', source: 'Live feed' };

/**
 * A block's content: switch between the modes its type allows (inline cards /
 * a live source), then edit that mode. Only registry data decides what shows.
 * The other mode's content is kept while you flip back and forth.
 */
export function DataEditor({ block, type, onChange }) {
  const { reg, dis, err, ro } = useBuilder();
  const stash = useRef({}); // `${blockId}:${mode}` -> data
  const modes = modesOf(type);
  const data = block.data;
  if (!modes.length) return <p className="ui-field__hint">This block has no content of its own to edit.</p>;

  const mode = data?.mode || '';
  const sources = sourcesOf(type, reg);
  const src = reg.sourceMap[data?.source];

  const switchTo = (next) => {
    if (next === mode) return;
    if (data) stash.current[`${block.id}:${mode}`] = data;
    onChange(stash.current[`${block.id}:${next}`] || blankData(type, next, reg));
  };
  const setSource = (key) => {
    const s = reg.sourceMap[key];
    onChange({ ...data, source: key, params: schemaDefaults(s?.params) });
  };

  return (
    <div className="hl2-fields">
      {modes.length > 1 && ro && <p className="ui-field__hint">Content: {MODE_LABEL[mode] || 'not set'}</p>}
      {modes.length > 1 && !ro && <Segmented label="Where the content comes from" options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={switchTo} />}
      {err('data') && <p className="ui-field__error" role="alert">{err('data')}</p>}
      {(!data || !modes.includes(mode)) && !ro && <p className="ui-field__hint">Pick how this block gets its content.</p>}
      {mode === 'inline' && <ItemsEditor items={data.items || []} max={maxItemsOf(type, reg)} show={type.data.itemFields} noun={NOUN[type.type] || 'card'} onChange={(items) => onChange({ ...data, items })} />}
      {mode === 'source' && (
        <>
          <Field label="Source" type="select" value={data.source || ''} error={err('data.source')} hint={src?.description || (src?.auth ? 'Shown to signed-in devotees only.' : 'The app loads this live, so it never goes stale.')} onChange={setSource} {...dis}>
            <option value="">Choose…</option>
            {sources.map((s) => <option key={s.key} value={s.key}>{s.title}{s.auth ? ' (signed-in only)' : ''}</option>)}
            {data.source && !sources.some((s) => s.key === data.source) && <option value={data.source}>{data.source}</option>}
          </Field>
          <SchemaFields schema={src?.params} values={data.params || {}} onChange={(params) => onChange({ ...data, params })} base="data.params" />
          <Field label="How many to show" type="number" min={1} max={20} step={1} value={data.limit ?? ''} placeholder="Default" error={err('data.limit')} hint="1 to 20. Leave blank for the app’s default." onChange={(v) => onChange({ ...data, limit: v === '' ? null : v })} {...dis} />
        </>
      )}
    </div>
  );
}
