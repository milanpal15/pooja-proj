import { api } from '../../../lib/api/index.js';
import { useAccess } from '../../../lib/access/index.js';
import { formatCoins } from '../../../lib/money.js';
import { formatDay } from '../../../lib/dates.js';
import { idOf } from '../../../lib/ids.js';
import { Badge, Button, Card, DataTable, EmptyState, ReadOnlyBadge, RowMenu, StatusText, Switch, useConfirm } from '../../../ui/index.js';
import { useListingEditor } from '../hooks/useListingEditor.js';
import { STATUS_LABEL, STATUS_TONE, listingStatus } from '../lib/chadhava.js';
import { ListingModal } from './ListingModal/index.js';
import { ListingViewModal } from './ListingViewModal.jsx';
import { useState } from 'react';

const windowOf = (l) => (l.startsAt || l.endsAt ? `${l.startsAt ? formatDay(l.startsAt) : '…'} → ${l.endsAt ? formatDay(l.endsAt) : '…'}` : 'Always');

/** Listings: occasion + temple groupings of offerings. */
export function ListingsTab({ area, c, refs, categoryName }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const editor = useListingEditor({ onSave: c.saveListing });
  const [viewing, setViewing] = useState(null);

  const askDelete = async (l) => {
    if (await confirm({ title: 'Delete listing', message: `Delete “${l.title}” and its ${l.offerings?.length ?? 0} offerings?`, confirmLabel: 'Delete', tone: 'danger' })) await c.removeListing(l);
  };
  const edit = (l) => (canEdit ? editor.open(l) : setViewing(l));

  return (
    <>
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">{c.listings.length} {c.listings.length === 1 ? 'listing' : 'listings'}</span>
          {canEdit ? <Button onClick={() => editor.open(null)}>+ New listing</Button> : <ReadOnlyBadge />}
        </div>
        {c.listings.length === 0 ? (
          <EmptyState title="No listings yet" action={canEdit ? <Button onClick={() => editor.open(null)}>+ New listing</Button> : undefined}>
            A listing groups offerings by occasion and temple, for example “Navratri Kanya Bhoj”.
          </EmptyState>
        ) : (
          <DataTable label="Chadhava listings" minWidth={860}>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Temple</th>
                <th>Category</th>
                <th>Window</th>
                <th>Offerings</th>
                <th>Status</th>
                <th>Visible</th>
                <th>
                  <span className="ui-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {c.listings.map((l) => {
                const st = listingStatus(l);
                const prices = (l.offerings || []).filter((o) => o.enabled !== false).map((o) => o.coins);
                return (
                  <tr key={idOf(l)}>
                    <td>
                      <div className="feat-person">
                        {l.banner ? <img className="ui-thumb ui-thumb--lg" src={api.asset(l.banner)} alt="" /> : <span className="ui-thumb ui-thumb--lg ui-thumb--ph" aria-hidden="true" />}
                        <b>{l.title}</b>
                      </div>
                    </td>
                    <td>{refs.nameOf('temples', l.templeSlug) || l.place || '—'}</td>
                    <td>{categoryName(l.category) ? <Badge tone="neutral">{categoryName(l.category)}</Badge> : '—'}</td>
                    <td>{windowOf(l)}</td>
                    <td>
                      {l.offerings?.length ?? 0}
                      {prices.length > 0 && <span className="sub">from {formatCoins(Math.min(...prices))} coins</span>}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Badge>
                    </td>
                    <td>{canEdit ? <Switch label={`Show ${l.title}`} checked={!!l.enabled} onChange={() => c.toggleListing(l)} /> : <StatusText on={!!l.enabled} />}</td>
                    <td className="actions">
                      <div className="ui-actions">
                        <Button variant="outline" size="sm" aria-label={`${canEdit ? 'Edit' : 'View'} ${l.title}`} onClick={() => edit(l)}>
                          {canEdit ? 'Edit' : 'View'}
                        </Button>
                        {canEdit && <RowMenu label={`More actions for ${l.title}`} items={[{ label: 'Delete', tone: 'danger', onSelect: () => askDelete(l) }]} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
      {editor.draft && <ListingModal editor={editor} refs={refs} categories={c.categories} />}
      {viewing && <ListingViewModal listing={viewing} refs={refs} categoryName={categoryName} onClose={() => setViewing(null)} />}
    </>
  );
}
