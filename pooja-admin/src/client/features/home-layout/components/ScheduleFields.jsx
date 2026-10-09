import { Field } from '../../../ui/index.js';
import { endOfDayIso, isoToDayKey, startOfDayIso } from '../../../lib/dates.js';

/** "Show from" / "Show until" as calendar days; blank = no limit. */
export function ScheduleFields({ section, errors, onChange }) {
  return (
    <div className="feat-grid2 feat-grid--top">
      <Field type="date" label="Show from" value={isoToDayKey(section.startsAt)} onChange={(d) => onChange('startsAt', d ? startOfDayIso(d) : null)} />
      <Field type="date" label="Show until" value={isoToDayKey(section.endsAt)} error={errors.endsAt} onChange={(d) => onChange('endsAt', d ? endOfDayIso(d) : null)} />
    </div>
  );
}
