import { useMemo, useState } from 'react';

import { idOf } from '../../../lib/ids.js';
import { Banner, Button, Card, EmptyState, ErrorState, Field, StatCard, StatGrid, TableSkeleton, useConfirm } from '../../../ui/index.js';
import { useEvents } from '../hooks/useEvents.js';
import { STATUS_FILTERS, kpis, num, statusChip } from '../lib/events.js';
import { EventTable } from './EventTable.jsx';

/** Events: four honest numbers, search + filters, the table. */
export function EventsTab({ canEdit, lookups, onOpen }) {
  const list = useEvents();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const loaded = list.status === 'ready' || list.status === 'stale';
  const k = useMemo(() => kpis(list.events, list.stats), [list.events, list.stats]);

  const shown = useMemo(
    () => list.events.filter((e) => (!q || (e.title || '').toLowerCase().includes(q.trim().toLowerCase())) && (!type || e.typeSlug === type) && (!status || statusChip(e).key === status)),
    [list.events, q, type, status],
  );
  const askDelete = async (e) => {
    const ok = await confirm({ title: 'Delete event', message: `Delete “${e.title}”? Devotees’ progress on it is not kept.`, confirmLabel: 'Delete event', tone: 'danger' });
    if (ok) await list.remove(e);
  };

  return (
    <>
      {list.status === 'stale' && <Banner tone="warning">Showing the last list we got. {list.error}</Banner>}
      {list.status === 'loading' && <TableSkeleton rows={5} />}
      {list.status === 'error' && <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />}
      {loaded && (
        <>
          <StatGrid aria-label="Events at a glance">
            <StatCard label="Live events" value={num(k.live)} />
            <StatCard label="Devotees taking part" value={num(k.joined)} />
            <StatCard label="Milestones completed this week" value={num(k.weekMilestones)} />
            <StatCard label="Event completion rate" value={k.completion == null ? '—' : `${k.completion}%`} />
          </StatGrid>
          <div className="ev-filters">
            <Field label="Search events" hideLabel type="search" placeholder="Search events" value={q} onChange={setQ} />
            <Field label="Type" hideLabel type="select" value={type} onChange={setType}>
              <option value="">Type: All</option>
              {lookups.types.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </Field>
            <Field label="Status" hideLabel type="select" value={status} options={STATUS_FILTERS} onChange={setStatus} />
          </div>
          {list.events.length === 0 ? (
            <Card>
              <EmptyState title="No events yet" action={canEdit ? <Button onClick={() => onOpen('new')}>+ New event</Button> : undefined}>
                Create an event and, once it is switched on, it shows in the app’s Events list.
              </EmptyState>
            </Card>
          ) : shown.length === 0 ? (
            <Card><EmptyState title="No events match">Change the search or the filters.</EmptyState></Card>
          ) : (
            <Card flush>
              <EventTable events={shown} stats={list.stats} lookups={lookups} canEdit={canEdit} onOpen={(e) => onOpen(idOf(e))} onToggle={list.toggle} onDelete={askDelete} />
            </Card>
          )}
          <p className="feat-note feat-note--bare">
            Joined and finished counts come from devotees’ progress and show “—” when they are not known. Editing a live event’s milestones never undoes milestones already completed.
            {!canEdit && ' You can look at this page, not change it.'}
          </p>
        </>
      )}
    </>
  );
}
