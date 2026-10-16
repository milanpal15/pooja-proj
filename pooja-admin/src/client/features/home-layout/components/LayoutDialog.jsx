import { useState } from 'react';

import { Banner, Button, Field, Modal, Switch } from '../../../ui/index.js';
import { MAX_LAYOUTS, fromInput, toInput } from '../lib/layout.js';
import { AudienceChips } from './AudienceChips.jsx';

const TITLES = {
  new: ['New layout', 'A named version of Home with its own schedule and audience. The first matching layout wins; otherwise the default shows.'],
  rename: ['Rename layout', 'Only the name changes.'],
  schedule: ['Schedule & audience', 'When this layout is live and who it is for. People outside it see the default layout.'],
};

/**
 * One dialog for the three layout edits: create (name, schedule, audience, "start from"), rename, and schedule & audience.
 * `layout` is the one being edited (null when creating). `onSubmit(values)` gets { name, enabled, audience, startsAt, endsAt, from }.
 */
export function LayoutDialog({ mode, layout, layouts, reg, busy, onSubmit, onClose }) {
  const seed = mode === 'new' ? null : layout; // a new layout starts blank, not as a copy of the one on screen
  const [name, setName] = useState(seed?.name || '');
  const [enabled, setEnabled] = useState(seed?.enabled !== false);
  const [audience, setAudience] = useState(seed?.audience || []);
  const [startsAt, setStartsAt] = useState(seed?.startsAt || null);
  const [endsAt, setEndsAt] = useState(seed?.endsAt || null);
  const [from, setFrom] = useState('default');
  const [title, sub] = TITLES[mode];
  const trimmed = name.trim();
  const nameError = trimmed.length > 40 ? 'At most 40 characters' : '';
  const ordered = endsAt && startsAt && new Date(endsAt) <= new Date(startsAt);
  const everyone = enabled && !audience.length && !startsAt && !endsAt;
  const showSchedule = mode !== 'rename';
  const ok = trimmed && !nameError && !ordered && (mode !== 'new' || layouts.length < MAX_LAYOUTS);
  const submit = () => ok && onSubmit({ name: trimmed, enabled, audience, startsAt, endsAt, from: from === '__blank' ? '' : from });
  return (
    <Modal open onClose={onClose} title={title} subtitle={sub} size="md" dismissible={!busy}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!ok} loading={busy} onClick={submit}>{mode === 'new' ? 'Create layout' : 'Save'}</Button></>}>
      <form className="hl2-fields" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Name" value={name} placeholder="e.g. Diwali layout" maxLength={60} error={nameError} onChange={setName} />
        {mode === 'new' && (
          <Field label="Start from" type="select" value={from} hint="Copy the sections of an existing layout, or begin with just the top bar and search." onChange={setFrom}>
            {layouts.map((l) => <option key={l.id} value={l.id}>Copy of {l.name}</option>)}
            <option value="__blank">Blank (top bar and search only)</option>
          </Field>
        )}
        {showSchedule && (
          <>
            <div className="hl3-trio hl3-trio--two">
              <Field label="Live from" type="datetime-local" value={toInput(startsAt)} hint="India time. Blank = no start." onChange={(v) => setStartsAt(fromInput(v))} />
              <Field label="Until" type="datetime-local" value={toInput(endsAt)} error={ordered ? 'Until must be after the start' : ''} hint="Blank = no end." onChange={(v) => setEndsAt(fromInput(v))} />
            </div>
            <div className="ui-field">
              <span className="ui-field__label">Who sees this layout</span>
              <AudienceChips value={audience} audiences={reg.audiences} onChange={setAudience} label="Who sees this layout" />
              <p className="ui-field__hint">Any of the chosen groups. Worked out on the phone; the server never learns who is who.</p>
            </div>
            <Switch variant="card" label="Switched on" hint="Off keeps the layout but the app never uses it." checked={enabled} onChange={setEnabled} />
            {everyone && <Banner tone="warning">With no schedule and no audience, this layout is shown to everyone instead of the default layout.</Banner>}
          </>
        )}
      </form>
    </Modal>
  );
}
