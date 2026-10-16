import { useEffect, useMemo, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { formatDay, formatWhen } from '../../../lib/dates.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, Banner, Button, Card, DataTable, EmptyState, ErrorState, Field, ProgressBar, TableSkeleton } from '../../../ui/index.js';
import { useParticipants } from '../hooks/useParticipants.js';
import { defaultEventId, matchEvents, progressPct, progressText, statusChip } from '../lib/events.js';

function Row({ p }) {
  const pct = progressPct(p.progress);
  return (
    <tr>
      <td><b>{p.name || '—'}</b>{p.contact ? <div className="sub">{p.contact}</div> : null}</td>
      <td>{p.passCode ? <code>{p.passCode}</code> : '—'}</td>
      <td className="hs-nowrap">{formatDay(p.joinedAt)}</td>
      <td>
        <div className="ev-finish">
          {pct == null ? <span className="ev-finish__none">—</span> : <ProgressBar value={pct} label={`${p.name || 'Devotee'} progress`} />}
          <span className="hs-nowrap">{progressText(p.progress)}</span>
        </div>
      </td>
      <td>{p.completed ? <Badge tone="success">Completed</Badge> : <span className="ev-finish__none">—</span>}</td>
      <td className="hs-nowrap">{formatWhen(p.lastActivityAt)}</td>
    </tr>
  );
}

/**
 * Participants (docs/EVENTS.md §10): pick an event, see who joined and how far
 * each has got. The API masks names and contacts for roles without devotee
 * access; they are shown exactly as received.
 */
export function ParticipantsTab() {
  const events = useLoader(async () => {
    const r = await api.events.list();
    return Array.isArray(r) ? r : r?.events ?? [];
  });
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState('');
  const list = events.data || [];
  const fallback = useMemo(() => defaultEventId(list), [list]);
  const eventId = picked || fallback;
  const options = matchEvents(list, q);
  // Keep the chosen event listed even when the search would hide it.
  const chosen = list.find((e) => String(idOf(e)) === eventId);
  const shownOptions = chosen && !options.includes(chosen) ? [chosen, ...options] : options;
  const part = useParticipants(eventId);

  useEffect(() => { if (picked && events.data && !events.data.some((e) => String(idOf(e)) === picked)) setPicked(''); }, [events.data, picked]);

  if (events.status === 'loading') return <TableSkeleton rows={5} />;
  if (events.status === 'error') return <ErrorState message={events.error} offline={events.offline} onRetry={events.reload} />;
  if (list.length === 0) return <Card><EmptyState title="No events yet">Participants are listed per event. Create an event first.</EmptyState></Card>;

  return (
    <>
      <div className="ev-filters ev-filters--pick">
        <Field label="Search events" hideLabel type="search" placeholder="Search events" value={q} onChange={setQ} />
        <Field label="Event" hideLabel type="select" value={eventId} onChange={setPicked}>
          {shownOptions.length === 0 && <option value="">No events match</option>}
          {shownOptions.map((e) => <option key={idOf(e)} value={String(idOf(e))}>{e.title || '(untitled)'} · {statusChip(e).label}</option>)}
        </Field>
      </div>
      {part.status === 'loading' && <TableSkeleton rows={5} />}
      {part.status === 'error' && <ErrorState message={part.error} offline={part.offline} onRetry={part.reload} />}
      {part.status === 'ready' && (part.items.length === 0 ? (
        <Card>
          <EmptyState title="Nobody has joined yet">Devotees who join this event, their pass codes and how far each has got are listed here. Nothing is shown until real registrations exist.</EmptyState>
        </Card>
      ) : (
        <Card flush>
          <DataTable label="Participants" minWidth={760} className="hs-table ev-table">
            <thead>
              <tr><th>Devotee</th><th>Pass code</th><th>Joined</th><th>Progress</th><th>Finished</th><th>Last activity</th></tr>
            </thead>
            <tbody>{part.items.map((p) => <Row key={p.id} p={p} />)}</tbody>
          </DataTable>
          {part.moreError && <Banner tone="warning">Could not load more. {part.moreError}</Banner>}
          {part.next && (
            <div className="ev-more">
              <Button variant="outline" loading={part.loadingMore} onClick={part.loadMore}>Load more</Button>
            </div>
          )}
        </Card>
      ))}
    </>
  );
}
