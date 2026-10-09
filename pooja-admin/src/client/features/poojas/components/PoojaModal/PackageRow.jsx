import { useState } from 'react';

import { api } from '../../../../lib/api/index.js';
import { Button, Field, IconButton, Switch, ThumbPick } from '../../../../ui/index.js';

/** One package: name, people, coins, shown, order controls — and an expanded view for Hindi name, perks and image. */
export function PackageRow({ pkg, index, count, errors = {}, uploading, onChange, onFile, onMove, onRemove }) {
  const [open, setOpen] = useState(false);
  const n = index + 1;
  const perks = pkg.perksText.split('\n').filter((l) => l.trim()).length;
  return (
    <li className="pj-pkg">
      <div className="pj-pkg__row">
        <Field label={`Package ${n} name`} hideLabel placeholder="Name (English)" value={pkg.name} error={errors.name} onChange={(v) => onChange({ name: v })} />
        <Field label={`Package ${n} people`} hideLabel type="number" min="1" max="12" value={pkg.persons} error={errors.persons} onChange={(v) => onChange({ persons: v })} />
        <Field label={`Package ${n} coins`} hideLabel type="number" min="1" value={pkg.coins} error={errors.coins} onChange={(v) => onChange({ coins: v })} />
        <Switch label={`Show package ${n}`} checked={pkg.enabled} onChange={(v) => onChange({ enabled: v })} />
        <span className="pj-pkg__tools">
          <IconButton label={`Move package ${n} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label={`Move package ${n} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
            ↓
          </IconButton>
          <Button variant="outline" size="sm" aria-expanded={open} aria-label={`Details of package ${n}`} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : `Details${perks ? ` · ${perks}` : ''}`}
          </Button>
          <IconButton label={`Remove package ${n}`} onClick={onRemove} disabled={count === 1}>
            ×
          </IconButton>
        </span>
      </div>
      {open && (
        <div className="pj-pkg__more">
          <Field label="Name (Hindi)" value={pkg.nameHi} onChange={(v) => onChange({ nameHi: v })} />
          <Field type="textarea" rows={3} label="What it includes (English) — one per line" value={pkg.perksText} onChange={(v) => onChange({ perksText: v })} />
          <Field type="textarea" rows={3} label="What it includes (Hindi) — one per line" value={pkg.perksHiText} onChange={(v) => onChange({ perksHiText: v })} />
          <div className="ui-field">
            <span className="ui-field__label">Image</span>
            <ThumbPick label={`package ${n} image`} src={pkg.image ? api.asset(pkg.image) : ''} uploading={uploading} onFile={onFile} onClear={() => onChange({ image: '' })} />
          </div>
        </div>
      )}
    </li>
  );
}
