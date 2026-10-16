import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useUpload } from '../../../lib/hooks/useUpload.js';
import { Badge, Button, Field, IconButton, Switch, ThumbPick } from '../../../ui/index.js';
import { actionTarget } from '../lib/actions.js';
import { badgePill } from '../lib/audience.js';
import { countUnder } from '../lib/errors.js';
import { BADGES, blankItem, fromInput, reorder, toInput } from '../lib/layout.js';
import { useDragReorder } from '../hooks/useDragReorder.js';
import { ActionField } from './ActionField.jsx';
import { useBuilder } from './BuilderContext.js';
import { Glyph } from './Glyph.jsx';

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
      <div className="hs-pair">{text('title', 'Name')}{text('titleHi', 'Name (Hindi)')}</div>
      <div className="hs-pair">{text('subtitle', 'Subtitle')}{text('subtitleHi', 'Subtitle (Hindi)')}</div>
      <div className="hs-pair">
        {has('icon') && <Field label="Icon" type="select" value={item.icon} options={noneOr(reg.icons)} error={err(`${path}.icon`)} onChange={(v) => onChange({ icon: v })} {...dis} />}
        {has('badge') && <Field label="Badge" type="select" value={item.badge} options={BADGES.map((b) => ({ value: b, label: b || 'None' }))} error={err(`${path}.badge`)} onChange={(v) => onChange({ badge: v, ...(v ? {} : { badgeUntil: null }) })} {...dis} />}
      </div>
      {has('badge') && item.badge && (
        <Field label="Badge shows until" type="datetime-local" value={toInput(item.badgeUntil)} error={err(`${path}.badgeUntil`)} hint="India time. After this the badge disappears but the tile stays. Blank = no end." onChange={(v) => onChange({ badgeUntil: fromInput(v) })} {...dis} />
      )}
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

/** "Opens · Pooja Seva list": a ref is shown by its catalogue title when the dashboard has the list. */
function useTargetLabel() {
  const { lookups } = useBuilder();
  const all = Object.values(lookups?.options || {}).flat();
  return (ref) => all.find((o) => o.value === ref)?.label || ref;
}

/**
 * The tiles / cards of an inline section (the board's TILES · n OF max MAX): each row is
 * grip (drag, or ↑/↓ when focused), icon, name, "Opens · target", badge pills and an on/off
 * switch (off = "Hidden in this layout"). Click a row for all its fields.
 */
export function ItemsEditor({ items, max, show, noun = 'card', onChange, basePath = 'data.items' }) {
  const { ro, errors } = useBuilder();
  const { busy, upload } = useUpload();
  const target = useTargetLabel();
  const [open, setOpen] = useState(() => new Set());
  const fields = show?.length ? ALL_FIELDS.filter((k) => show.includes(k)) : ALL_FIELDS;
  const now = Date.now();

  const set = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (from, to) => { onChange(reorder(items, from, to)); setOpen(new Set()); };
  const { drag, rowProps } = useDragReorder({ enabled: !ro, onMove: move });
  const toggle = (i) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const onFile = async (i, file) => {
    const url = await upload(file, `item-${i}`);
    if (url) set(i, { image: url });
  };
  const key = (e, i) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); } else if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
  };

  return (
    <div className="hl2-items">
      <div className="hl3-sechead">
        <span className="hl3-label">{noun}s · {items.length} of {max} max</span>
        {!ro && (
          <Button variant="outline" size="sm" disabled={items.length >= max} onClick={() => { onChange([...items, blankItem()]); setOpen(new Set([items.length])); }}>
            + Add {noun}
          </Button>
        )}
      </div>
      {items.length === 0 && <p className="ui-field__hint">Nothing here yet.{ro ? '' : ` Add the first ${noun}.`}</p>}
      <ul className="hl2-items__list" aria-label={`${noun}s`}>
        {items.map((it, i) => {
          const path = `${basePath}.${i}`;
          const bad = countUnder(errors, path);
          const isOpen = open.has(i) || bad > 0;
          const off = it.enabled === false;
          const pill = badgePill(it, now);
          const name = it.title || it.titleHi || `${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`;
          const cls = `hl2-item hl3-tile ${bad ? 'hl2-item--bad' : ''} ${off ? 'hl3-tile--off' : ''} ${it.liveBadge ? 'hl3-tile--live' : ''} ${drag.from === i ? 'hl3-drag' : ''} ${drag.over === i ? (drag.after ? 'hl3-over-after' : 'hl3-over-before') : ''}`;
          return (
            <li key={i} className={cls}>
              <div className="hl3-tile__row" {...rowProps(i)}>
                {!ro && (
                  <button type="button" className="hl3-grip" aria-label={`Move ${name}: drag it, or press the up or down arrow`} onKeyDown={(e) => key(e, i)}><i /><i /><i /></button>
                )}
                {it.image
                  ? <img className="hl3-tile__ico hl3-tile__ico--img" src={api.asset(it.image)} alt="" />
                  : <span className="hl3-tile__ico"><Glyph name={it.icon} size={18} /></span>}
                <button type="button" className="hl3-tile__text" aria-expanded={isOpen} onClick={() => toggle(i)}>
                  <b>{name}</b>
                  <span>{off ? 'Hidden in this layout' : `Opens · ${actionTarget(it.action, target)}`}</span>
                </button>
                {bad > 0 && <Badge tone="danger">{bad} to fix</Badge>}
                {it.liveBadge && !off && <span className="hl3-tag hl3-tag--live">LIVE badge · auto</span>}
                {pill && !off && <span className={`hl3-tag ${pill.expired ? 'hl3-tag--muted' : 'hl3-tag--time'}`}>{pill.text}</span>}
                {ro
                  ? <span className="hl2-row__state">{off ? 'Off' : 'On'}</span>
                  : <Switch label={`${off ? 'Show' : 'Hide'} ${name}`} checked={!off} onChange={(v) => set(i, { enabled: v })} />}
              </div>
              {isOpen && (
                <>
                  <ItemFields item={it} path={path} show={fields} onChange={(p) => set(i, p)} uploading={busy === `item-${i}`} onFile={(f) => onFile(i, f)} />
                  {!ro && (
                    <div className="hl3-tile__tools">
                      <IconButton label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</IconButton>
                      <IconButton label={`Move ${name} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>↓</IconButton>
                      <Button variant="outline" size="sm" onClick={() => { onChange(items.filter((_, j) => j !== i)); setOpen(new Set()); }}>Remove {noun}</Button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {errors[basePath] && <p className="ui-field__error" role="alert">{errors[basePath]}</p>}
      {items.length >= max && <p className="ui-field__hint">At most {max} {noun}s.</p>}
    </div>
  );
}
