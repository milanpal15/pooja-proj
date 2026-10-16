import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, Button, DataTable, ProgressBar, StatusText, Switch } from '../../../ui/index.js';
import { dateLabel, milestoneCountOf, num, pct, statusChip, subtitleOf } from '../lib/events.js';
import { TypeChip } from './TypeChip.jsx';

function Row({ e, stats, lookups, canEdit, onOpen, onToggle, onDelete }) {
  const st = statusChip(e);
  const s = stats[idOf(e)] || {};
  const done = pct(s.finished, s.joined);
  const cap = e.registration?.capacity;
  const cover = e.cover ? { backgroundImage: `url("${api.asset(e.cover)}")` } : { background: `linear-gradient(135deg, ${e.theme?.gradient?.[0] || e.theme?.color || lookups.typeOf(e.typeSlug)?.color || 'var(--accent-container)'}, ${e.theme?.gradient?.[1] || 'var(--primary)'})` };
  return (
    <tr className="hs-row">
      <td>
        <div className="hs-slide">
          <span className="hs-thumb ev-thumb" style={cover} aria-hidden="true" />
          <button type="button" className="hs-name" aria-label={`${canEdit ? 'Edit' : 'View'} ${e.title}`} onClick={() => onOpen(e)}>
            <b>{e.title || '(untitled)'}</b>
            <span className="sub">{subtitleOf(e)}</span>
          </button>
        </div>
      </td>
      <td><TypeChip type={lookups.typeOf(e.typeSlug)} fallback={e.typeName || e.typeSlug} /></td>
      <td className="hs-nowrap">{dateLabel(e)}</td>
      <td>{milestoneCountOf(e) || '—'}</td>
      <td>{s.joined == null ? '—' : cap ? `${num(s.joined)} / ${num(cap)}` : num(s.joined)}</td>
      <td>
        <div className="ev-finish">
          {done == null ? <span className="ev-finish__none">—</span> : <><ProgressBar value={done} label={`${e.title} finished all`} /><span>{done}%</span></>}
        </div>
      </td>
      <td><Badge tone={st.tone}>{st.label}</Badge></td>
      <td>{canEdit ? <Switch label={`Show ${e.title}`} checked={e.published === true} onChange={() => onToggle(e)} /> : <StatusText on={e.published === true} onLabel="Shown" offLabel="Hidden" />}</td>
      {canEdit && <td><Button variant="outline" size="sm" aria-label={`Delete ${e.title}`} onClick={() => onDelete(e)}>Delete</Button></td>}
    </tr>
  );
}

export function EventTable({ events, stats, lookups, canEdit, onOpen, onToggle, onDelete }) {
  return (
    <DataTable label="Events" minWidth={860} className="hs-table ev-table">
      <thead>
        <tr><th>Event</th><th>Type</th><th>Dates</th><th>Milestones</th><th>Joined</th><th>Finished all</th><th>Status</th><th>Show</th>{canEdit && <th><span className="ui-sr-only">Actions</span></th>}</tr>
      </thead>
      <tbody>
        {events.map((e) => <Row key={idOf(e) || e.slug} e={e} stats={stats} lookups={lookups} canEdit={canEdit} onOpen={onOpen} onToggle={onToggle} onDelete={onDelete} />)}
      </tbody>
    </DataTable>
  );
}
