import { useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { Banner, Button, Field, Modal } from '../../../ui/index.js';
import { headline } from '../lib/impact.js';

/** Panic button: refuse one specific build. Shows how many devices it hits before you confirm. */
export function BlockBuildModal({ code, options, currentBlocked, currentPolicy, onClose, onConfirm }) {
  const [pick, setPick] = useState(code != null ? String(code) : '');
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setImpact(null);
    if (!/^\d+$/.test(pick)) return undefined;
    let dead = false;
    api.versionPolicy
      .impact({ blockedVersionCodes: [...new Set([...currentBlocked, Number(pick)])] })
      .then((r) => !dead && setImpact(r))
      .catch((e) => !dead && setErr(e.message));
    return () => {
      dead = true;
    };
  }, [pick, currentBlocked]);

  const h = headline(impact);
  return (
    <Modal open onClose={onClose} size="sm" title="Block this build" dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="danger-solid" loading={busy} disabled={!/^\d+$/.test(pick)} onClick={async () => { setBusy(true); await onConfirm(Number(pick)); setBusy(false); }}>Block build {pick || ''}</Button>
        </>
      }>
      <Field label="Build to block" type="select" value={pick} onChange={setPick}
        options={[{ value: '', label: 'Choose a build…' }, ...options.map((o) => ({ value: String(o.code), label: o.label }))]}
        hint="Phones running it get a full-screen “This version is blocked” and cannot use the app." />
      {err && <Banner tone="error">{err}</Banner>}
      {h && <Banner tone="warning">{`This ${h.blocks}.`}</Banner>}
      {currentPolicy && <p className="muted" style={{ fontSize: 13 }}>Applies immediately unless approvals are on and another operator can approve; then it goes to them first.</p>}
    </Modal>
  );
}
