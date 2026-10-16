import { useEffect, useRef } from 'react';

import { Badge, DataTable } from '../../../ui/index.js';
import { formatDay } from '../../../lib/dates.js';
import { displayName, methodLabel, roleLabel, statusOf, versionLabel, whenLabel } from '../lib/format.js';
import { userHash } from '../lib/route.js';
import { Avatar } from './Avatar.jsx';
import { TagChips } from './TagChips.jsx';

const SORTABLE = { name: 'name', lastActive: 'lastActive', createdAt: 'createdAt' };

const HEAD = {
  name: 'Name',
  contact: 'Contact',
  method: 'Sign-in',
  role: 'Role',
  status: 'Status',
  tags: 'Tags',
  version: 'App version',
  push: 'Push',
  lastActive: 'Last active',
  createdAt: 'Created',
};

function Cell({ id, user: u }) {
  switch (id) {
    case 'contact':
      return <td>{u.contact || '—'}</td>;
    case 'method':
      return <td className="muted">{methodLabel(u.method)}</td>;
    case 'role':
      return <td>{roleLabel(u.role)}</td>;
    case 'status': {
      const s = statusOf(u);
      return (
        <td>
          <Badge tone={s.tone}>{s.label}</Badge>
        </td>
      );
    }
    case 'tags':
      return (
        <td>
          <TagChips tags={u.tags} />
        </td>
      );
    case 'version':
      return <td className="muted">{versionLabel(u)}</td>;
    case 'push':
      return <td className="muted">{u.hasPush ? 'On' : 'Off'}</td>;
    case 'lastActive':
      return <td className="muted">{whenLabel(u.lastActive)}</td>;
    case 'createdAt':
      return <td className="muted">{formatDay(u.createdAt)}</td>;
    default:
      return <td />;
  }
}

/** Header cell that sorts when it can: a button, with aria-sort on the th. */
function Th({ id, sort, onSort }) {
  const key = SORTABLE[id];
  if (!key) return <th scope="col">{HEAD[id]}</th>;
  const on = sort.sort === key;
  const dir = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={dir}>
      <button type="button" className="usr-sort" onClick={() => onSort({ sort: key, dir: on && sort.dir === 'desc' ? 'asc' : key === 'name' && !on ? 'asc' : 'desc' })}>
        {HEAD[id]}
        <span aria-hidden="true">{on ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  );
}

/**
 * The user table. The name is a real link to `#/people/users/<id>` (open in a new tab, copy the link), and the
 * drawer opens on a plain click. A checkbox column appears only for people who may act on rows (devotees:edit).
 */
export function UserTable({ rows, columns, sort, onSort, selectable, selected, onToggle, onToggleAll, activeId, busy }) {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const some = rows.some((r) => selected.has(r.id));
  const master = useRef(null);
  useEffect(() => {
    if (master.current) master.current.indeterminate = some && !all;
  }, [some, all]);
  const shown = columns.filter((c) => c !== 'name');
  return (
    <div className={busy ? 'usr-busy' : undefined} aria-busy={busy || undefined}>
      <DataTable label="Users" minWidth={780} className="usr-table">
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="usr-sel">
                <input ref={master} type="checkbox" aria-label="Select all loaded users" checked={all} onChange={() => onToggleAll(!all)} />
              </th>
            )}
            <Th id="name" sort={sort} onSort={onSort} />
            {shown.map((c) => (
              <Th key={c} id={c} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className={u.id === activeId ? 'usr-row--active' : undefined} aria-selected={selected.has(u.id) || undefined}>
              {selectable && (
                <td className="usr-sel">
                  <input type="checkbox" aria-label={`Select ${displayName(u)}`} checked={selected.has(u.id)} onChange={() => onToggle(u.id)} />
                </td>
              )}
              <td>
                <a className="usr-name" href={userHash(u.id)}>
                  <Avatar user={u} size={30} />
                  <span>{displayName(u)}</span>
                </a>
              </td>
              {shown.map((c) => (
                <Cell key={c} id={c} user={u} />
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
