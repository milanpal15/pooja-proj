import { formatDay } from '../../../lib/dates.js';

/**
 * A field's value as plain text, for the read-only views (table cells aside).
 * Pure: the read-only modal and the tests both use it.
 */
export function displayValue(field, value) {
  switch (field.type) {
    case 'bool':
      return value ? 'On' : 'Off';
    case 'csv':
      return Array.isArray(value) ? value.join(', ') : String(value ?? '');
    case 'select': {
      const o = field.options?.find((x) => x.value === value);
      return o ? o.label : String(value ?? '');
    }
    case 'enumList': {
      const key = (Array.isArray(value) ? value : String(value ?? '').split(','))
        .map((x) => String(x).trim())
        .filter(Boolean)
        .sort()
        .join(',');
      return field.options?.find((x) => x.value === key)?.label ?? key;
    }
    case 'dayIso':
      return value ? formatDay(value) : 'No limit';
    default:
      return value === undefined || value === null ? '' : String(value);
  }
}
