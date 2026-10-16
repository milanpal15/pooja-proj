import { useState } from 'react';

import { Banner, Button, Field, Modal, Segmented, Switch } from '../../../ui/index.js';
import { STEPS, blankRelease, validateRelease } from '../lib/release.js';

/**
 * "New release" (or edit): Build -> Notes -> Rollout -> Review. Creating registers the build; the rollout choices
 * (recommend it, make it the minimum with a grace date) then go through the normal policy save, so they get the same
 * impact check and approval rules as editing the policy by hand.
 */
export function ReleaseWizard({ initial, existingCodes, defaultStoreUrl, editing, onClose, onSubmit, impactOfMinimum }) {
  const [f, setF] = useState(() => initial ?? blankRelease(defaultStoreUrl));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const errors = validateRelease(f, step, existingCodes, editing);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const last = step === STEPS.length - 1;
  const steps = editing ? STEPS.slice(0, 2) : STEPS;

  const next = async () => {
    if (Object.keys(errors).length) return;
    if (step < steps.length - 1) return setStep(step + 1);
    setBusy(true);
    setErr('');
    try {
      await onSubmit(f);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${initial.versionName}` : 'New release'} dismissible={!busy}
      footer={
        <>
          {step > 0 && <Button variant="secondary" disabled={busy} onClick={() => setStep(step - 1)}>Back</Button>}
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={Object.keys(errors).length > 0} onClick={next}>{step < steps.length - 1 ? 'Next' : editing ? 'Save release' : 'Register release'}</Button>
        </>
      }>
      <ol className="wiz" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={i === step ? 'wiz__on' : i < step ? 'wiz__done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      {err && <Banner tone="error">{err}</Banner>}
      {step === 0 && (
        <div className="rel-form">
          <div className="rel-form__row">
            <Field label="Version name" value={f.versionName} onChange={(v) => set({ versionName: v })} error={errors.versionName} placeholder="1.4.0" hint="What people see in the store." />
            <Field label="Build number" inputMode="numeric" value={f.versionCode} onChange={(v) => set({ versionCode: v })} error={errors.versionCode} readOnly={editing} placeholder="14" hint="android.versionCode in app.json. The policy is written in these numbers." />
          </div>
          <Field label="Store link" value={f.storeUrl} onChange={(v) => set({ storeUrl: v })} error={errors.storeUrl} placeholder="https://play.google.com/store/apps/details?id=…" />
        </div>
      )}
      {step === 1 && (
        <div className="rel-form">
          <Field label="What’s new (English)" type="textarea" rows={4} value={f.notes} onChange={(v) => set({ notes: v })} error={errors.notes} />
          <Field label="What’s new (हिन्दी)" type="textarea" rows={4} value={f.notesHi} onChange={(v) => set({ notesHi: v })} error={errors.notesHi} />
          {editing && <Segmented label="Status" value={f.status} onChange={(v) => set({ status: v })} options={[{ value: 'draft', label: 'Draft' }, { value: 'live', label: 'Live' }]} />}
        </div>
      )}
      {step === 2 && !editing && (
        <div className="rel-form">
          <Segmented label="Status" value={f.status} onChange={(v) => set({ status: v })} options={[{ value: 'live', label: 'Live in the store' }, { value: 'draft', label: 'Draft (not out yet)' }]} />
          {f.status === 'live' ? (
            <>
              <Switch variant="card" label="Recommend this build" hint="Older builds get a dismissible “Update available”." checked={f.recommend} onChange={(v) => set({ recommend: v })} />
              <Switch variant="card" label="Also make it the minimum" hint="Older builds see a full-screen “Update required”. This can need a second operator’s approval." checked={f.setMinimum} onChange={(v) => set({ setMinimum: v })} />
              {f.setMinimum && <Field label="Enforce from" type="datetime-local" value={f.graceUntil} onChange={(v) => set({ graceUntil: v })} hint="Until then older builds are only reminded. Blank = enforce now." />}
            </>
          ) : (
            <p className="muted">A draft only registers the build. The policy is not touched.</p>
          )}
        </div>
      )}
      {last && !editing && (
        <dl className="rel-review">
          <div><dt>Build</dt><dd>{f.versionName} (build {f.versionCode})</dd></div>
          <div><dt>Status</dt><dd>{f.status}</dd></div>
          <div><dt>Policy</dt><dd>{f.status !== 'live' ? 'unchanged' : [f.recommend && 'recommended', f.setMinimum && `minimum${f.graceUntil ? ` from ${new Date(f.graceUntil).toLocaleString('en-IN')}` : ' now'}`].filter(Boolean).join(' and ') || 'unchanged'}</dd></div>
          {f.setMinimum && impactOfMinimum && <div><dt>Effect</dt><dd>{impactOfMinimum(Number(f.versionCode))}</dd></div>}
        </dl>
      )}
    </Modal>
  );
}
