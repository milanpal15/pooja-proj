import { useMemo } from 'react';

import { useStreams } from '../hooks/useStreams.js';
import { Badge, Card, DataTable, EmptyState, ErrorState, TableSkeleton } from '../../../ui/index.js';
import { clock, daysLabel, scheduleRows, streamStatus } from '../lib/live.js';

/** Every aarti of every stream in one read-friendly table, by time. Edited on the stream, not here. */
export function ScheduleTab({ lookups }) {
  const list = useStreams();
  const rows = useMemo(() => scheduleRows(list.streams, lookups.templeName), [list.streams, lookups]);
  if (list.status === 'loading') return <TableSkeleton rows={5} />;
  if (list.status === 'error') return <ErrorState message={list.error} offline={list.offline} onRetry={list.reload} />;
  if (!rows.length) return <Card><EmptyState title="No aartis scheduled">Add aartis to a stream and they appear here.</EmptyState></Card>;
  return (
    <>
      <Card flush>
        <DataTable label="Aarti schedule across streams" minWidth={520}>
          <thead><tr><th>Time (IST)</th><th>Aarti</th><th>Temple</th><th>Days</th><th>Stream</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const st = streamStatus(r.stream);
              return (
                <tr key={i}>
                  <td className="nowrap"><b>{clock(r.time)}</b></td>
                  <td>{r.name}{r.nameHi ? <span className="sub"> {r.nameHi}</span> : null}</td>
                  <td>{r.temple}</td>
                  <td>{daysLabel(r.days)}</td>
                  <td><Badge tone={st.tone}>{st.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </Card>
      <p className="feat-note feat-note--bare">To change an aarti, edit it on the temple’s stream under Streams.</p>
    </>
  );
}
