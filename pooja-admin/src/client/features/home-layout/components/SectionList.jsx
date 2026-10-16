import { Badge, Button, IconButton, Switch } from '../../../ui/index.js';
import { matchesAudience, scheduleState, shortAudience, windowLabel } from '../lib/audience.js';
import { summaryLine } from '../lib/summary.js';
import { useDragReorder } from '../hooks/useDragReorder.js';
import { Glyph } from './Glyph.jsx';

export const FIXED_ID = '__fixed';

/** Audience chips for a row: the first segment (+n). Greyed with a line-through when the previewed persona is not in it. */
function Tags({ block, reg, persona, now }) {
  const known = reg.audiences.map((a) => a.key);
  const aud = block.audience || [];
  const miss = aud.length > 0 && !matchesAudience(aud, persona, known);
  const win = windowLabel(block);
  const out = scheduleState(block, now);
  const names = aud.map((a) => shortAudience(a, reg));
  return (
    <>
      {win && <span className={`hl3-tag hl3-tag--time ${out ? 'hl3-tag--miss' : ''}`} title={out === 'ended' ? 'This window has ended' : out === 'scheduled' ? 'Not started yet' : 'Shown in this window'}>{win}</span>}
      {aud.length > 0 && (
        <span className={`hl3-tag hl3-tag--aud ${miss ? 'hl3-tag--miss' : ''}`} title={`${names.join(', ')}${miss ? '. The previewed person is not in this audience, so they would not see it.' : ''}`}>
          {names[0]}{aud.length > 1 ? ` +${aud.length - 1}` : ''}
        </span>
      )}
      {block.language && block.language !== 'all' && <span className="hl3-tag hl3-tag--fixed">{block.language.toUpperCase()} only</span>}
    </>
  );
}

/**
 * SECTIONS · n: the layout's blocks top to bottom. The first rows (the registry's fixed types) are ONE locked
 * "Top bar and search · Fixed" row. The others drag to reorder (the grip also takes ↑/↓ when focused),
 * and switch on or off. `selectedId` is a block id, or FIXED_ID for the locked row.
 */
export function SectionList({ blocks, reg, fixed, selectedId, canEdit, errorsOf, persona, now, onSelect, onToggle, onMove, onMoveTo, onAdd }) {
  const { drag, rowProps } = useDragReorder({
    enabled: canEdit,
    canDrop: (i) => i >= fixed,
    onMove: (from, to) => onMoveTo(blocks[from].id, to),
  });
  const total = blocks.length - Math.max(0, fixed - 1); // the fixed pair counts as one row, as in the design
  const key = (e, b) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); onMove(b.id, -1); } else if (e.key === 'ArrowDown') { e.preventDefault(); onMove(b.id, 1); }
  };
  return (
    <div className="hl3-card hl3-list">
      <div className="hl3-card__head">
        <span className="hl3-label hl3-grow">Sections · {total}</span>
        {canEdit && <Button variant="outline" size="sm" onClick={onAdd}>+ Add section</Button>}
      </div>
      {blocks.length === 0 && <p className="hl3-pad ui-field__hint">No sections. The phone would show an empty Home.</p>}
      <ol className="hl3-rows" aria-label="Home sections, top to bottom">
        {fixed > 0 && (
          <li className={`hl3-row hl3-row--fixed ${selectedId === FIXED_ID ? 'hl3-row--on' : ''}`}>
            <span className="hl3-grip hl3-grip--none" aria-hidden="true"><i /><i /><i /></span>
            <span className="hl3-ic"><Glyph name="search" /></span>
            <button type="button" className="hl3-row__text" aria-current={selectedId === FIXED_ID ? 'true' : undefined} onClick={() => onSelect(FIXED_ID)}>
              <b>Top bar and search</b>
              <span>Greeting, coins, notifications</span>
            </button>
            <span className="hl3-tag hl3-tag--fixed">Fixed</span>
            <span className="hl3-lock" title="Always on, always first" aria-label="Locked: always on"><i /></span>
          </li>
        )}
        {blocks.map((b, i) => {
          if (i < fixed) return null;
          const type = reg.typeMap[b.type];
          const bad = Object.keys(errorsOf(b.id)).length;
          const off = b.enabled === false;
          const label = b.title || type?.title || b.type;
          const cls = `hl3-row ${b.id === selectedId ? 'hl3-row--on' : ''} ${off ? 'hl3-row--off' : ''} ${drag.from === i ? 'hl3-drag' : ''} ${drag.over === i ? (drag.after ? 'hl3-over-after' : 'hl3-over-before') : ''}`;
          return (
            <li key={b.id} className={cls} {...rowProps(i)}>
              {canEdit
                ? <button type="button" className="hl3-grip" aria-label={`Move ${label}: drag it, or press the up or down arrow`} onKeyDown={(e) => key(e, b)}><i /><i /><i /></button>
                : <span className="hl3-grip hl3-grip--none" aria-hidden="true"><i /><i /><i /></span>}
              <span className="hl3-ic"><Glyph name={type?.icon} /></span>
              <button type="button" className="hl3-row__text" aria-current={b.id === selectedId ? 'true' : undefined} onClick={() => onSelect(b.id)}>
                <b>{label}</b>
                <span>{off ? 'Hidden in this layout' : summaryLine(b, reg)}</span>
              </button>
              {canEdit && (
                <span className="hl3-row__move">
                  <IconButton label={`Move ${label} up`} disabled={i <= fixed} onClick={() => onMove(b.id, -1)}>↑</IconButton>
                  <IconButton label={`Move ${label} down`} disabled={i === blocks.length - 1} onClick={() => onMove(b.id, 1)}>↓</IconButton>
                </span>
              )}
              {bad > 0 && <Badge tone="danger">{bad} to fix</Badge>}
              {!type && <Badge tone="warning">Unknown type</Badge>}
              <Tags block={b} reg={reg} persona={persona} now={now} />
              {canEdit
                ? <Switch label={`${off ? 'Show' : 'Hide'} ${label}`} checked={!off} onChange={(v) => onToggle(b.id, v)} />
                : <span className="hl2-row__state">{off ? 'Off' : 'On'}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
