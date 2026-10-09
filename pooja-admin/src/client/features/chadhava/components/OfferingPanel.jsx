import { useState } from 'react';

import { useUpload } from '../../../lib/hooks/useUpload.js';
import { idOf } from '../../../lib/ids.js';
import { Button, Card, Field, ReadoutField, useToast } from '../../../ui/index.js';
import { validateOffering } from '../lib/chadhava.js';
import { OfferingForm } from './OfferingForm.jsx';

/** The side panel for one offering (the design's "Edit offering"): its fields plus which listing it belongs to. */
export function OfferingPanel({ offering, listings, categoryName, onSave, onCancel }) {
  const toast = useToast();
  const { busy, upload } = useUpload();
  const [o, setO] = useState(offering);
  const [listingId, setListingId] = useState(offering.listingId || idOf(listings[0]) || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isNew = !offering.key;
  const listing = listings.find((l) => idOf(l) === listingId);

  const save = async () => {
    const e = validateOffering(o);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await onSave({ ...o, coins: Number(o.coins) }, listingId);
    } catch (err) {
      toast.error(`Could not save. ${err.message}`);
      setSaving(false);
    }
  };
  const onFile = async (file) => {
    const url = await upload(file, 'img');
    if (url) setO((x) => ({ ...x, image: url }));
  };

  return (
    <Card title={isNew ? 'New offering' : 'Edit offering'} className="chd-side">
      <OfferingForm offering={o} errors={errors} uploading={busy === 'img'} onChange={(patch) => setO((x) => ({ ...x, ...patch }))} onFile={onFile} />
      <Field type="select" label="Listing" value={listingId} options={listings.map((l) => ({ value: idOf(l), label: l.title }))} onChange={setListingId} />
      <ReadoutField label="Category" hint="Set on the listing">
        {categoryName(listing?.category) || '—'}
      </ReadoutField>
      <div className="chd-side__foot">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button loading={saving} onClick={save}>
          Save
        </Button>
      </div>
    </Card>
  );
}
