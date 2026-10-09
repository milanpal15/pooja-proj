import { useState } from 'react';

import { formatCoins } from '../../../../lib/money.js';
import { useUpload } from '../../../../lib/hooks/useUpload.js';
import { Button, IconButton, Switch } from '../../../../ui/index.js';
import { OfferingForm } from '../OfferingForm.jsx';

function OfferingCard({ o, index, count, errors, uploading, onChange, onFile, onMove, onRemove }) {
  const [open, setOpen] = useState(!o.title);
  const n = index + 1;
  return (
    <li className="ui-repeat__item">
      <div className="ui-repeat__head">
        <b>{o.title || `Offering ${n}`}</b>
        <span className="chd-off__meta">{o.coins !== '' ? `${formatCoins(o.coins)} coins` : 'No price yet'}</span>
        <span className="ui-repeat__tools">
          <Switch label={`Show offering ${n}`} checked={o.enabled} onChange={(v) => onChange({ enabled: v })} />
          <IconButton label={`Move offering ${n} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label={`Move offering ${n} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            ↓
          </IconButton>
          <Button variant="outline" size="sm" aria-expanded={open} aria-label={`Details of offering ${n}`} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Details'}
          </Button>
          <Button variant="danger" size="sm" aria-label={`Remove offering ${n}`} onClick={onRemove}>
            Remove
          </Button>
        </span>
      </div>
      {open && <OfferingForm offering={o} errors={errors} uploading={uploading} onChange={onChange} onFile={onFile} />}
    </li>
  );
}

/** The offerings embedded in a listing: collapsible cards with the same fields as the Offerings tab's panel. */
export function OfferingsEditor({ editor }) {
  const { draft, errors } = editor;
  const { busy, upload } = useUpload();
  const onFile = async (o, file) => {
    const url = await upload(file, o._cid);
    if (url) editor.setOffering(o._cid, { image: url });
  };
  return (
    <div className="ui-repeat">
      <ul className="ui-repeat__list" aria-label="Offerings">
        {draft.offerings.map((o, i) => (
          <OfferingCard
            key={o._cid}
            o={o}
            index={i}
            count={draft.offerings.length}
            errors={errors.offerings?.[o._cid]}
            uploading={busy === o._cid}
            onChange={(patch) => editor.setOffering(o._cid, patch)}
            onFile={(f) => onFile(o, f)}
            onMove={(d) => editor.moveOffering(i, d)}
            onRemove={() => editor.removeOffering(o._cid)}
          />
        ))}
      </ul>
      <Button variant="outline" onClick={editor.addOffering}>
        + Add offering
      </Button>
      <p className="ui-field__hint">Devotees see prices in coins only. Prices are read from here at the moment they pay.</p>
    </div>
  );
}
