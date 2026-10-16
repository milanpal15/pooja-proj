import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useUpload } from '../../../lib/hooks/useUpload.js';
import { Badge, Button, Field, IconButton, Switch, ThumbPick } from '../../../ui/index.js';
import { BADGES, blankItem } from '../lib/layout.js';
import { countUnder } from '../lib/errors.js';
import { ActionField } from './ActionField.jsx';
import { useBuilder } from './BuilderContext.js';

const ALL_FIELDS = ['image', 'title', 'titleHi', 'subtitle', 'subtitleHi', 'icon', 'badge', 'liveBadge', 'flag', 'deitySlug', 'action'];
const noneOr = (list) => [{ value: '', label: 'None' }, ...list.map((v) => ({ value: v, label: v }))];

/** One item's fields. Which appear is the registry's `data.itemFields`, else all of them. */
function ItemFields({ item, path, show, onChange, uploading, onFile }) {
  const { reg, lookups, dis, err } = useBuilder();
  const has = (k) => show.includes(k);
  const text = (k, label) => has(k) && <Field key={k} label={label} value={item[k]} error={err(`${path}.${k}`)} onChange={(v) => onChange({ [k]: v })} {...dis} />;
  return (
    <div className="hl2-item__body">
      {has('image') && (
        <div className="ui-field">
          <span className="ui-field__label">Image</span>
          {dis.disabled
            ? (item.image ? <img className="ui-thumb ui-thumb--lg" src={api.asset(item.image)} alt="" /> : <span className="ui-field__hint">No image</span>)
            : <ThumbPick label="item image" src={item.image ? api.asset(item.image) : ''} uploading={uploading} onFile={onFile} onClear={() => onChange({ image: '' })} />}
          {err(`${path}.image`) && <p className="ui-field__error">{err(`${path}.image`)}</p>}
        </div>
      )}
      <div className="hs-pair">{text('title', 'Title')}{text('titleHi', 'Title (Hindi)')}</div>
      <div className="hs-pair">{text('subtitle', 'Subtitle')}{text('subtitleHi', 'Subtitle (Hindi)')}</div>
      <div className="hs-pair">
        {has('icon') && <Field label="Icon" type="select" value={item.icon} options={noneOr(reg.icons)} error={err(`${path}.icon`)} onChange={(v) => onChange({ icon: v })} {...dis} />}
        {has('badge') && <Field label="Badge" type="select" value={item.badge} options={BADGES.map((b) => ({ value: b, label: b || 'None' }))} error={err(`${path}.badge`)} onChange={(v) => onChange({ badge: v })} {...dis} />}
      </div>
      <div className="hs-pair">
        {has('flag') && <Field label="Only while flag is on" type="select" value={item.flag} options={noneOr(reg.flags)} error={err(`${path}.flag`)} onChange={(v) => onChange({ flag: v })} {...dis} />}
        {has('deitySlug') && (
          <Field label="Deity" type="select" value={item.deitySlug} error={err(`${path}.deitySlug`)} onChange={(v) => onChange({ deitySlug: v })} {...dis}>
            <option value="">None</option>
            {lookups.options.deities.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {item.deitySlug && !lookups.options.deities.some((o) => o.value === item.deitySlug) && <option value={item.deitySlug}>{item.deitySlug}</option>}
          </Field>
        )}
      </div>
      {has('liveBadge') && <Switch variant="card" label="Show LIVE while a darshan stream is live" checked={!!item.liveBadge} onChange={(v) => onChange({ liveBadge: v })} {...dis} />}
      {has('action') && <ActionField label="When tapped" value={item.action} path={`${path}.action`} onChange={(a) => onChange({ action: a })} />}
    </div>
  );
}

/** The items of an inline block: a list of collapsible cards with add / reorder / copy / remove. */
export function ItemsEditor({ items, max, show, onChange, basePath = 'data.items' }) {
  const { ro, errors } = useBuilder();
  const { busy, upload } = useUpload();
  const [open, setOpen] = useState(() => new Set());
  const fields = show?.length ? ALL_FIELDS.filter((k) => show.includes(k)) : ALL_FIELDS;

  const set = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i, d) => {
    const next = items.slice();
    next.splice(i + d, 0, next.splice(i, 1)[0]);
    onChange(next);
    setOpen(new Set());
  };
  const toggle = (i) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const onFile = async (i, file) => {
    const url = await upload(file, `item-${i}`);
    if (url) set(i, { image: url });
  };

  return (
    <div className="hl2-items">
      {items.length === 0 && <p className="ui-field__hint">No cards yet.{ro ? '' : ' Add the first one below.'}</p>}
      <ul className="hl2-items__list" aria-label="Cards">
        {items.map((it, i) => {
          const path = `${basePath}.${i}`;
          const bad = countUnder(errors, path);
          const isOpen = open.has(i) || bad > 0;
          return (
            <li key={i} className={`hl2-item ${bad ? 'hl2-item--bad' : ''}`}>
              <div className="hl2-item__head">
                {it.image ? <img className="ui-thumb" src={api.asset(it.image)} alt="" /> : <span className="ui-thumb ui-thumb--ph" aria-hidden="true">{i + 1}</span>}
                <button type="button" className="hl2-item__title" aria-expanded={isOpen} onClick={() => toggle(i)}>
                  <b>{it.title || it.titleHi || `Card ${i + 1}`}</b>
                  <span>{it.subtitle || it.icon || (it.action?.type && it.action.type !== 'none' ? `opens ${it.action.type}` : '')}</span>
                </button>
                {bad > 0 && <Badge tone="danger">{bad} to fix</Badge>}
                {it.badge && <Badge tone="accent">{it.badge}</Badge>}
                {it.liveBadge && <Badge tone="live">LIVE</Badge>}
                {!ro && (
                  <span className="hl2-item__tools">
                    <IconButton label={`Move card ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</IconButton>
                    <IconButton label={`Move card ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</IconButton>
                    <IconButton label={`Remove card ${i + 1}`} onClick={() => { onChange(items.filter((_, j) => j !== i)); setOpen(new Set()); }}>×</IconButton>
                  </span>
                )}
              </div>
              {isOpen && <ItemFields item={it} path={path} show={fields} onChange={(p) => set(i, p)} uploading={busy === `item-${i}`} onFile={(f) => onFile(i, f)} />}
            </li>
          );
        })}
      </ul>
      {errors[basePath] && <p className="ui-field__error" role="alert">{errors[basePath]}</p>}
      {!ro && (
        <Button variant="outline" disabled={items.length >= max} onClick={() => { onChange([...items, blankItem()]); setOpen(new Set([items.length])); }}>
          + Add card
        </Button>
      )}
      {items.length >= max && <p className="ui-field__hint">At most {max} cards.</p>}
    </div>
  );
}
