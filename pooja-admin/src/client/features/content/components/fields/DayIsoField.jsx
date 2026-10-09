import { Field } from '../../../../ui/index.js';
import { endOfDayIso, isoToDayKey, startOfDayIso } from '../../../../lib/dates.js';

/**
 * A calendar day stored as an ISO instant (null = no limit): "show from" is
 * the start of the picked day, "show until" (`field.end`) its last moment.
 */
export function DayIsoField({ field, value, onChange }) {
  return (
    <Field
      type="date"
      label={field.label}
      hint={field.hint}
      value={isoToDayKey(value)}
      onChange={(day) => onChange(day ? (field.end ? endOfDayIso(day) : startOfDayIso(day)) : null)}
    />
  );
}
