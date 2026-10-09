import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useAccess } from '../../../lib/access/index.js';
import { formatCoins } from '../../../lib/money.js';
import { Badge, Button, Card, DataTable, EmptyState, ReadOnlyBadge, ReadOnlyList, RowMenu, Switch, StatusText, ViewOnlyModal, useConfirm } from '../../../ui/index.js';
import { blankOffering, flattenOfferings } from '../lib/chadhava.js';
import { OfferingPanel } from './OfferingPanel.jsx';

/** Offerings across every listing, flattened. Editing happens in the side panel and writes through the parent listing. */
export function OfferingsTab({ area, c, categoryName }) {
  const canEdit = useAccess().canEdit(area);
  const confirm = useConfirm();
  const [selected, setSelected] = useState(null); // an offering row, or a blank for "new"
  const rows = flattenOfferings(c.listings);

  const open = (o) => setSelected({ ...o });
  const askDelete = async (o) => {
    if (await confirm({ title: 'Delete offering', message: `Delete “${o.title}” from ${o.listingTitle}?`, confirmLabel: 'Delete', tone: 'danger' })) {
      if (selected?.key === o.key) setSelected(null);
      await c.removeOffering(o);
    }
  };
  const save = async (o, listingId) => {
    await c.saveOffering(o, listingId);
    setSelected(null);
  };

  if (!c.listings.length) {
    return <EmptyState title="No listings yet">Offerings live inside a listing. Add a listing first, then its offerings appear here.</EmptyState>;
  }
  return (
    <div className="chd-split">
      <Card flush>
        <div className="ui-toolbar">
          <span className="ui-toolbar__note">{rows.length} {rows.length === 1 ? 'offering' : 'offerings'}</span>
          {canEdit ? <Button onClick={() => open(blankOffering())}>+ New offering</Button> : <ReadOnlyBadge />}
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No offerings yet">Add one, and choose which listing it belongs to.</EmptyState>
        ) : (
          <DataTable label="Offerings" minWidth={600} className="chd-table">
            <thead>
              <tr>
                <th>Offering</th>
                <th>Category</th>
                <th className="num">Coins</th>
                <th>Listing</th>
                <th>Shown</th>
                <th>
                  <span className="ui-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={`${o.listingId}:${o.key}`} className={selected && selected.key === o.key && selected.listingId === o.listingId ? 'chd-row--on' : ''}>
                  <td>
                    <div className="feat-person">
                      {o.image ? <img className="ui-thumb" src={api.asset(o.image)} alt="" /> : <span className="ui-thumb ui-thumb--ph" aria-hidden="true" />}
                      <b>{o.title}</b>
                    </div>
                  </td>
                  <td>{categoryName(o.category) ? <Badge tone="neutral">{categoryName(o.category)}</Badge> : '—'}</td>
                  <td className="num">{formatCoins(o.coins)}</td>
                  <td>{o.listingTitle}</td>
                  <td>{canEdit ? <Switch label={`Show ${o.title}`} checked={o.enabled !== false} onChange={() => c.toggleOffering(o)} /> : <StatusText on={o.enabled !== false} />}</td>
                  <td className="actions">
                    <div className="ui-actions">
                      <Button variant="outline" size="sm" aria-label={`${canEdit ? 'Edit' : 'View'} ${o.title}`} onClick={() => open(o)}>
                        {canEdit ? 'Edit' : 'View'}
                      </Button>
                      {canEdit && <RowMenu label={`More actions for ${o.title}`} items={[{ label: 'Delete', tone: 'danger', onSelect: () => askDelete(o) }]} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
      {selected && canEdit && <OfferingPanel key={`${selected.listingId}:${selected.key}:${selected._cid}`} offering={selected} listings={c.listings} categoryName={categoryName} onSave={save} onCancel={() => setSelected(null)} />}
      {selected && !canEdit && (
        <ViewOnlyModal title={selected.title} subtitle={selected.listingTitle} onClose={() => setSelected(null)}>
          <ReadOnlyList
            label="Offering details"
            rows={[
              { label: 'Title (English)', value: selected.title },
              { label: 'Title (Hindi)', value: selected.titleHi },
              { label: 'Description', value: selected.desc },
              { label: 'Price', value: `${formatCoins(selected.coins)} coins` },
              { label: 'Category', value: categoryName(selected.category) },
              { label: 'Listing', value: selected.listingTitle },
              { label: 'Shown', value: selected.enabled !== false ? 'On' : 'Off' },
            ]}
          />
        </ViewOnlyModal>
      )}
    </div>
  );
}
