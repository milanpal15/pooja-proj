import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, DataTable, StatusText, Switch } from '../../../ui/index.js';
import { nextAartiOf, nextLabel, sourceLabel, streamStatus } from '../lib/live.js';

function Row({ s, lookups, selected, canEdit, onSelect, onToggle }) {
  const st = streamStatus(s);
  const temple = lookups.templeOf(s.templeSlug);
  const name = temple?.name || s.templeSlug;
  const sub = [lookups.categoryName(s.categorySlug), temple?.location].filter(Boolean).join(' · ');
  const img = s.cover || temple?.imageUrl;
  const next = nextLabel(nextAartiOf(s));
  return (
    <tr className={`hs-row ${selected ? 'hs-row--sel' : ''}`}>
      <td>
        <div className="hs-slide">
          <span className="hs-thumb lv-thumb" style={img ? { backgroundImage: `url("${api.asset(img)}")` } : undefined} aria-hidden="true" />
          <button type="button" className="hs-name" aria-pressed={selected} aria-label={`${canEdit ? 'Edit' : 'View'} ${name}`} onClick={() => onSelect(s)}>
            <b>{name}</b>
            {sub && <span className="sub">{sub}</span>}
          </button>
        </div>
      </td>
      <td>{sourceLabel(s)}</td>
      <td>
        <Badge tone={st.tone}>{st.label}</Badge>
        {st.note && <span className="lv-note">{st.note}</span>}
      </td>
      <td>{s.viewers != null ? s.viewers.toLocaleString('en-IN') : '—'}</td>
      <td>{next || '—'}</td>
      <td>{canEdit ? <Switch label={`Show ${name}`} checked={s.enabled !== false} onChange={() => onToggle(s)} /> : <StatusText on={s.enabled !== false} onLabel="Shown" offLabel="Hidden" />}</td>
    </tr>
  );
}

export function StreamTable({ streams, lookups, selectedId, canEdit, onSelect, onToggle }) {
  return (
    <DataTable label="Live darshan streams" minWidth={560} className="hs-table lv-table">
      <thead>
        <tr><th>Temple stream</th><th>Source</th><th>Status</th><th>Viewers</th><th>Next aarti</th><th>Show</th></tr>
      </thead>
      <tbody>
        {streams.map((s) => (
          <Row key={idOf(s)} s={s} lookups={lookups} canEdit={canEdit} selected={selectedId != null && selectedId === idOf(s)} onSelect={onSelect} onToggle={onToggle} />
        ))}
      </tbody>
    </DataTable>
  );
}
