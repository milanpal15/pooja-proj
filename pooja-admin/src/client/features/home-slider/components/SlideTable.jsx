import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, DataTable, IconButton, StatusText, Switch } from '../../../ui/index.js';
import { scheduleLabel, slideStatus, targetLabel, toneGradient } from '../lib/slide.js';

function Row({ slide: s, index, count, names, canEdit, selected, dragging, dropTarget, onSelect, onToggle, onMove, dragProps }) {
  const st = slideStatus(s);
  const type = s.target?.type || 'none';
  const thumb = s.image ? `url("${api.asset(s.image)}") center / cover` : toneGradient(type);
  return (
    <tr className={`hs-row ${selected ? 'hs-row--sel' : ''} ${dragging ? 'hs-row--drag' : ''} ${dropTarget ? 'hs-row--over' : ''}`} draggable={canEdit} {...dragProps}>
      <td className="hs-row__order">
        {canEdit && (
          <span className="hs-order">
            <span className="hs-grip" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
            <span className="hs-order__arrows">
            <IconButton label={`Move ${s.title} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>↑</IconButton>
            <IconButton label={`Move ${s.title} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>↓</IconButton>
            </span>
          </span>
        )}
      </td>
      <td>
        <div className="hs-slide">
          <span className="hs-thumb" style={{ background: thumb }} aria-hidden="true" />
          <button type="button" className="hs-name" aria-pressed={selected} aria-label={`${canEdit ? 'Edit' : 'View'} ${s.title}`} onClick={() => onSelect(s)}>
            <b>{s.title}</b>
            {s.tag && <span className="sub">Tag: {s.tag}</span>}
          </button>
        </div>
      </td>
      <td>{targetLabel(s.target, names, s.href)}</td>
      <td className="hs-nowrap">{scheduleLabel(s)}</td>
      <td>
        <Badge tone={st.tone}>{st.label}</Badge>
      </td>
      <td>{canEdit ? <Switch label={`Show ${s.title}`} checked={s.enabled !== false} onChange={() => onToggle(s)} /> : <StatusText on={s.enabled !== false} />}</td>
    </tr>
  );
}

/** The slides, in the order the app shows them. Drag a row or use its arrows; both end in `onMove(from, to)`. */
export function SlideTable({ slides, selectedId, canEdit, names, onSelect, onToggle, onMove }) {
  const [from, setFrom] = useState(null);
  const [over, setOver] = useState(null);
  const end = () => {
    setFrom(null);
    setOver(null);
  };
  const dragFor = (i) =>
    canEdit
      ? {
          onDragStart: (e) => {
            setFrom(i);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
          },
          onDragOver: (e) => {
            if (from === null) return;
            e.preventDefault();
            setOver(i);
          },
          onDrop: (e) => {
            e.preventDefault();
            if (from !== null) onMove(from, i);
            end();
          },
          onDragEnd: end,
        }
      : {};
  return (
    <DataTable label="Home slider slides, in the order the app shows them" minWidth={520} className="hs-table">
      <thead>
        <tr>
          <th><span className="ui-sr-only">Order</span></th>
          <th>Slide</th>
          <th>Opens</th>
          <th>Schedule</th>
          <th>Status</th>
          <th>Show</th>
        </tr>
      </thead>
      <tbody>
        {slides.map((s, i) => (
          <Row
            key={idOf(s) ?? s.slug}
            slide={s}
            index={i}
            count={slides.length}
            names={names}
            canEdit={canEdit}
            selected={selectedId != null && selectedId === idOf(s)}
            dragging={from === i}
            dropTarget={over === i && from !== null && from !== i}
            onSelect={onSelect}
            onToggle={onToggle}
            onMove={onMove}
            dragProps={dragFor(i)}
          />
        ))}
      </tbody>
    </DataTable>
  );
}
