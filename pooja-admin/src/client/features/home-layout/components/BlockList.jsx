import { Badge, Button, IconButton, Switch } from '../../../ui/index.js';
import { actionLabel } from '../lib/actions.js';
import { visibility, visibilityLabel } from '../lib/preview.js';

/** One line describing where a block's content comes from, from its data alone. */
function dataChip(block, reg) {
  const d = block.data;
  if (!d) return '';
  if (d.mode === 'source') return reg.sourceMap[d.source]?.title || d.source || 'no source';
  return `${(d.items || []).length} card${(d.items || []).length === 1 ? '' : 's'}`;
}

/**
 * The ordered block list: select, switch on or off, ↑ ↓ (no dragging),
 * duplicate and delete. Rows are plain buttons-in-a-list so the whole thing is
 * keyboard-operable; actions are hidden for an account that cannot edit.
 */
export function BlockList({ blocks, reg, selectedId, canEdit, errorsByBlock, onSelect, onToggle, onMove, onDuplicate, onDelete, onAdd }) {
  return (
    <div className="hl2-list">
      <div className="hl2-list__head">
        <h2 className="hl2-h">Blocks <span className="hl2-count">{blocks.length}</span></h2>
        {canEdit && <Button size="sm" onClick={() => onAdd()}>+ Add block</Button>}
      </div>
      {blocks.length === 0 && <p className="ui-field__hint">No blocks. The phone would show an empty Home.</p>}
      <ol className="hl2-rows" aria-label="Home blocks, top to bottom">
        {blocks.map((b, i) => {
          const type = reg.typeMap[b.type];
          const vis = visibility(b);
          const bad = Object.keys(errorsByBlock[b.id] || {}).length;
          const label = b.title || type?.title || b.type;
          return (
            <li key={b.id} className={`hl2-row ${b.id === selectedId ? 'hl2-row--on' : ''} ${b.enabled === false ? 'hl2-row--off' : ''}`}>
              <span className={`hl2-row__bar ${b.tone ? `hl-tone-${b.tone}` : 'hl2-row__bar--none'}`} aria-hidden="true" />
              <div className="hl2-row__top">
                <button type="button" className="hl2-row__main" aria-current={b.id === selectedId ? 'true' : undefined} onClick={() => onSelect(b.id)}>
                  <b>{label}</b>
                  <span>{[b.title ? type?.title || b.type : '', dataChip(b, reg), b.flag ? `flag ${b.flag}` : '', b.action?.type && b.action.type !== 'none' ? actionLabel(b.action) : ''].filter(Boolean).join(' · ') || '\u00a0'}</span>
                </button>
                <span className="hl2-row__chips">
                  {bad > 0 && <Badge tone="danger">{bad} to fix</Badge>}
                  {vis && vis !== 'disabled' && <Badge tone="warning">{visibilityLabel(vis)}</Badge>}
                  {b.language && b.language !== 'all' && <Badge tone="info">{b.language.toUpperCase()} only</Badge>}
                  {!type && <Badge tone="warning">Unknown type</Badge>}
                </span>
              </div>
              <div className="hl2-row__foot">
                {canEdit ? (
                  <>
                    <Switch label={`${b.enabled === false ? 'Show' : 'Hide'} ${label}`} checked={b.enabled !== false} onChange={(v) => onToggle(b.id, v)} />
                    <span className="hl2-row__tools">
                      <IconButton label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(b.id, -1)}>↑</IconButton>
                      <IconButton label={`Move ${label} down`} disabled={i === blocks.length - 1} onClick={() => onMove(b.id, 1)}>↓</IconButton>
                      <IconButton label={`Duplicate ${label}`} onClick={() => onDuplicate(b.id)}>⧉</IconButton>
                      <IconButton label={`Delete ${label}`} onClick={() => onDelete(b.id)}>×</IconButton>
                    </span>
                  </>
                ) : (
                  <span className="hl2-row__state">{b.enabled === false ? 'Off' : 'On'}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
