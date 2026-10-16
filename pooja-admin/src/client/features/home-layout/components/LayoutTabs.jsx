import { Button, IconButton, Modal, Segmented } from '../../../ui/index.js';
import { PRESETS, audienceLabel, layoutLive, personaLabel, presetOf, scheduleLabel, shortAudience, windowLabel } from '../lib/audience.js';
import { DEFAULT_ID, MAX_LAYOUTS, canMoveLayout } from '../lib/layout.js';
import { AudienceChips } from './AudienceChips.jsx';

/** The layout tabs (the design's strip): a green dot while live now, the schedule, then + New layout and "Preview as". */
export function LayoutTabs({ layouts, activeId, now, canEdit, persona, onPersona, onCustom, onSelect, onNew }) {
  const custom = !presetOf(persona);
  return (
    <div className="hl3-strip">
      <div className="hl3-seg hl3-seg--scroll" role="tablist" aria-label="Layouts">
        {layouts.map((l) => {
          const live = l.id !== DEFAULT_ID && layoutLive(l, now);
          const when = l.id === DEFAULT_ID ? '' : scheduleLabel(l, now);
          return (
            <button key={l.id} type="button" role="tab" aria-selected={l.id === activeId} tabIndex={l.id === activeId ? 0 : -1} className={`hl3-seg__opt ${l.id === activeId ? 'hl3-seg__opt--on' : ''} ${l.enabled === false ? 'hl3-seg__opt--off' : ''}`} onClick={() => onSelect(l.id)}>
              {live && <i className="hl3-dot" title="Live now" aria-label="Live now" />}
              {l.name}{when ? ` · ${when}` : ''}{l.enabled === false ? ' · off' : ''}
            </button>
          );
        })}
      </div>
      {canEdit && <Button variant="outline" size="sm" disabled={layouts.length >= MAX_LAYOUTS} onClick={onNew}>+ New layout</Button>}
      <div className="hl3-previewas">
        <span id="hl3-pas">Preview as</span>
        <div className="hl3-seg" role="radiogroup" aria-labelledby="hl3-pas">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={presetOf(persona)?.id === p.id} className={`hl3-seg__opt ${presetOf(persona)?.id === p.id ? 'hl3-seg__opt--on' : ''}`} onClick={() => onPersona(p)}>{p.label}</button>
          ))}
          <button type="button" role="radio" aria-checked={custom} className={`hl3-seg__opt ${custom ? 'hl3-seg__opt--on' : ''}`} onClick={onCustom}>{custom ? `Custom · ${personaLabel(persona)}` : 'Custom…'}</button>
        </div>
      </div>
    </div>
  );
}

/** What the active layout is, in a line, and what can be done to it. */
export function LayoutBar({ layout, doc, reg, now, canEdit, onRename, onSchedule, onDuplicate, onDelete, onMove }) {
  const isDef = layout.id === DEFAULT_ID;
  const when = windowLabel(layout);
  const aud = (layout.audience || []).map((a) => shortAudience(a, reg));
  const bits = isDef
    ? ['The fallback: shown when no other layout applies.']
    : [layout.enabled === false ? 'Switched off' : layoutLive(layout, now) ? 'Live now' : 'Not live yet', when, aud.length ? `Audience: ${aud.join(', ')}` : 'For everyone'].filter(Boolean);
  return (
    <div className="hl3-layoutbar">
      <span className="hl3-layoutbar__info"><b>{layout.name}</b> · {bits.join(' · ')}</span>
      {canEdit && (
        <span className="hl3-layoutbar__tools">
          <Button variant="ghost" size="sm" onClick={onRename}>Rename</Button>
          {!isDef && <Button variant="ghost" size="sm" onClick={onSchedule}>Schedule &amp; audience</Button>}
          <Button variant="ghost" size="sm" disabled={doc.layouts.length >= MAX_LAYOUTS} onClick={onDuplicate}>Duplicate</Button>
          {!isDef && (
            <>
              <IconButton label={`Move ${layout.name} earlier (higher priority)`} disabled={!canMoveLayout(doc, layout.id, -1)} onClick={() => onMove(-1)}>←</IconButton>
              <IconButton label={`Move ${layout.name} later (lower priority)`} disabled={!canMoveLayout(doc, layout.id, 1)} onClick={() => onMove(1)}>→</IconButton>
              <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/** "Preview as" → Custom…: a language and any of the audience segments. */
export function PreviewAsModal({ persona, reg, onChange, onClose }) {
  return (
    <Modal open onClose={onClose} title="Preview as" subtitle="Pretend to be someone: the phone and the audience badges follow." size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="hl2-fields">
        <Segmented label="Language" options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'Hindi' }]} value={persona.lang} onChange={(lang) => onChange({ ...persona, lang })} />
        <div className="ui-field">
          <span className="ui-field__label">This person is…</span>
          <AudienceChips value={persona.segments} audiences={reg.audiences} onChange={(segments) => onChange({ ...persona, segments })} label="Segments this person is in" />
          <p className="ui-field__hint">Everyone = in none of the groups. A section for “{audienceLabel('has_booking', reg)}” shows to anyone in that group.</p>
        </div>
      </div>
    </Modal>
  );
}
