import { useState } from 'react';

import { formatCoins } from '../../../lib/money.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, Button, Card, DataTable } from '../../../ui/index.js';
import { useAllBookings } from '../hooks/useBookings.js';
import { accountOf, itemsLine, nextChadhavaStep, nextPoojaStep, statusChip } from '../lib/bookings.js';
import { BookingDetailModal } from './BookingDetailModal.jsx';
import { BookingFilters } from './BookingFilters.jsx';
import { ListStates } from './ListStates.jsx';
import { StatusActionCell } from './StatusActionCell.jsx';

function Row({ b, busy, onAdvance, onOpen }) {
  const chadhava = b.kind === 'chadhava';
  const chip = statusChip(b);
  const step = (chadhava ? nextChadhavaStep : nextPoojaStep)(b.status);
  return (
    <tr>
      <td className="nowrap">
        <b>{b.bookingRef}</b>
      </td>
      <td className="nowrap">{accountOf(b)}</td>
      <td>
        {chadhava ? `Chadhava · ${itemsLine(b.items) || b.listingTitle}` : `${b.poojaTitle} · ${b.packageName}`}
        {b.prasad && <span className="sub">+ prasad</span>}
      </td>
      <td className="num">{chadhava ? '—' : b.persons}</td>
      <td className="num">
        <b>{formatCoins(b.totalCoins)}</b>
      </td>
      <td>
        <Badge tone={chip.tone}>{chip.label}</Badge>
      </td>
      <td className="actions">
        <div className="ui-actions">
          {step ? (
            <StatusActionCell step={step} busy={busy} name={b.bookingRef} onAdvance={() => onAdvance(b, step)} />
          ) : (
            !chadhava && (
              <Button variant="outline" size="sm" aria-label={`Details of ${b.bookingRef}`} onClick={() => onOpen(b)}>
                View
              </Button>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

/** Pooja bookings and chadhava orders together: filter, move each forward (orders:edit), open a pooja booking's details. */
export function BookingsTable() {
  const list = useAllBookings();
  const [open, setOpen] = useState(null);
  return (
    <>
      <BookingFilters filters={list.filters} onChange={list.setFilter} />
      <Card flush>
        <ListStates list={list} emptyTitle="No bookings" emptyBody="Bookings and chadhava orders appear here as devotees pay in coins.">
          <DataTable label="Bookings" minWidth={860}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Devotee</th>
                <th>Pooja and package</th>
                <th className="num">People</th>
                <th className="num">Coins</th>
                <th>Status</th>
                <th>
                  <span className="ui-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((b) => (
                <Row key={`${b.kind}:${idOf(b) ?? b.bookingRef}`} b={b} busy={list.busy === idOf(b)} onAdvance={list.advance} onOpen={setOpen} />
              ))}
            </tbody>
          </DataTable>
        </ListStates>
      </Card>
      <p className="feat-note feat-note--bare">Devotee names and numbers are masked unless your role may see devotee details. Marking a booking updates the devotee’s status screen and sends a notification.</p>
      {open && <BookingDetailModal booking={open} onClose={() => setOpen(null)} />}
    </>
  );
}
