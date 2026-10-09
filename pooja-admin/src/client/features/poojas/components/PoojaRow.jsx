import { api } from '../../../lib/api/index.js';
import { formatDay } from '../../../lib/dates.js';
import { idOf } from '../../../lib/ids.js';
import { Button, RowMenu, StatusText, Switch } from '../../../ui/index.js';
import { priceRange } from '../lib/pooja.js';
import { StatusChip } from './StatusChip.jsx';

/** One pooja: thumbnail + title, temple, date, price range, bookings, status, visibility, actions. */
export function PoojaRow({ pooja: p, nameOf, canEdit, busy, opening, onToggle, onEdit, onDuplicate, onDelete }) {
  const range = priceRange(p.packages);
  const count = p.packages?.length ?? p.packageCount;
  const sub = p.status === 'draft' && !count ? 'Draft · no packages yet' : [nameOf('festivals', p.festivalSlug), p.tithi].filter(Boolean).join(' · ');
  return (
    <tr>
      <td>
        <div className="feat-person">
          {p.gallery?.[0] ? <img className="ui-thumb ui-thumb--lg" src={api.asset(p.gallery[0])} alt="" /> : <span className="ui-thumb ui-thumb--lg ui-thumb--ph" aria-hidden="true" />}
          <div>
            <b>{p.title}</b>
            {sub && <span className="sub">{sub}</span>}
          </div>
        </div>
      </td>
      <td>{nameOf('temples', p.templeSlug) || '—'}</td>
      <td>{p.poojaDate ? formatDay(p.poojaDate) : 'Every day'}</td>
      <td>{range ? `${range} · ${count} pkg${count === 1 ? '' : 's'}` : '—'}</td>
      <td className="num">{p.bookingCount ?? 0}</td>
      <td>
        <StatusChip pooja={p} />
      </td>
      <td>{canEdit ? <Switch label={`Show ${p.title}`} checked={!!p.enabled} disabled={busy} onChange={() => onToggle(p)} /> : <StatusText on={!!p.enabled} />}</td>
      <td className="actions">
        <div className="ui-actions">
          <Button variant="outline" size="sm" loading={opening} aria-label={`${canEdit ? 'Edit' : 'View'} ${p.title}`} onClick={() => onEdit(p)}>
            {canEdit ? 'Edit' : 'View'}
          </Button>
          {canEdit && (
            <RowMenu
              label={`More actions for ${p.title}`}
              items={[
                { label: 'Duplicate as draft', disabled: busy, onSelect: () => onDuplicate(p) },
                { label: 'Delete', tone: 'danger', disabled: busy, onSelect: () => onDelete(p) },
              ]}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
