import { Badge, Button, IconButton, StatusText, Switch } from '../../../ui/index.js';
import { describe } from '../lib/describe.js';
import { isLiveNow, scheduleLabel } from '../lib/schedule.js';
import { isFixed, nameOf, sourceOf } from '../lib/sources.js';

const goTo = (tab) => {
  location.hash = encodeURIComponent(tab);
};

/** One Home block: grip + arrows, band swatch, name, source / schedule / live chips, its action and its switch. */
export function SectionRow({ section, index, count, canUp, canDown, heroSlides, canEdit, dragging, dropTarget, onToggle, onEdit, onMove, dragProps }) {
  const src = sourceOf(section);
  const name = nameOf(section);
  const schedule = scheduleLabel(section);
  const fixed = isFixed(section);
  const live = !fixed && isLiveNow(section) && !!schedule;
  return (
    <li
      className={`hl-row ${dragging ? 'hl-row--drag' : ''} ${dropTarget ? 'hl-row--over' : ''} ${live ? 'hl-row--live' : ''}`}
      draggable={canEdit && !fixed}
      {...dragProps}>
      {canEdit && !fixed && (
        <span className="hl-row__order">
          <span className="hl-row__grip" aria-hidden="true" title="Drag to reorder">
            ⋮⋮
          </span>
          <IconButton label={`Move ${name} up`} disabled={!canUp} onClick={() => onMove(index, canUp - 1)}>
            ↑
          </IconButton>
          <IconButton label={`Move ${name} down`} disabled={!canDown} onClick={() => onMove(index, canDown - 1)}>
            ↓
          </IconButton>
        </span>
      )}
      <i className={`hl-swatch-bar hl-tone-${section.tone || src.tone}`} aria-hidden="true" />
      <div className="hl-row__text">
        <b>{name}</b>
        <span>{describe(section, heroSlides)}</span>
      </div>
      <div className="hl-row__chips">
        {!fixed && <Badge tone={src.chip === 'dashboard' ? 'accent' : 'success'}>{src.chip === 'dashboard' ? 'Dashboard' : 'Automatic'}</Badge>}
        {fixed && <Badge tone="neutral">Fixed in the app</Badge>}
        {schedule && <Badge tone="info">{schedule}</Badge>}
        {live && <Badge tone="live">Live now</Badge>}
      </div>
      <div className="hl-row__actions">
        {src.link && (
          <Button variant="outline" size="sm" aria-label={`${src.link.label} for ${name}`} onClick={() => goTo(src.link.tab)}>
            {src.link.label}
          </Button>
        )}
        {!fixed && <Button variant="outline" size="sm" aria-label={`${canEdit ? 'Edit' : 'View'} ${name}`} onClick={() => onEdit(section)}>
          {canEdit ? (src.link ? 'Edit' : src.editLabel || 'Edit') : 'View'}
        </Button>}
      </div>
      <div className="hl-row__switch">
        {fixed ? null : canEdit ? <Switch label={`Show ${name}`} checked={!!section.enabled} onChange={() => onToggle(section)} /> : <StatusText on={!!section.enabled} />}
      </div>
    </li>
  );
}
