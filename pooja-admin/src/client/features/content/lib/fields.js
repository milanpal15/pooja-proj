/**
 * Pure helpers over a field config ([{ key, label, type, col?, default? }]).
 * No React, no network — the container and the modal both lean on these.
 */

/**
 * Normalise whatever is stored into one of the option values.
 *
 * Tolerates an array (the correct shape), a comma string (hand-edited or
 * legacy), or nothing at all, and falls back to the first option so the
 * select always has a matching value rather than rendering blank.
 */
export function toEnumValue(stored, options) {
  const list = Array.isArray(stored)
    ? stored
    : String(stored ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
  const key = list.slice().sort().join(',');
  return options.some((o) => o.value === key) ? key : options[0].value;
}

// Columns are chosen, not the first four fields. `bookingEnabled` is the
// 7th temple field, so it was never visible in the table — the one control
// an operator most needs at a glance was reachable only through Edit.
export const columnsOf = (fields) => (fields.some((f) => f.col) ? fields.filter((f) => f.col) : fields.filter((f) => !f.virtual).slice(0, 4));

/** A new row: each field's `default()` if it has one, else a sensible empty. */
export const blankRow = (fields) =>
  Object.fromEntries(
    fields.filter((f) => !f.virtual).map((f) => {
      if (f.default) return [f.key, f.default()];
      switch (f.type) {
        case 'bool':
          return [f.key, true];
        case 'number':
          return [f.key, 0];
        case 'csv':
          return [f.key, []];
        case 'enumList':
          // Stored as an array; the option values are comma-joined strings.
          return [f.key, String(f.options?.[0]?.value ?? '').split(',').filter(Boolean)];
        case 'select':
          return [f.key, f.options?.[0]?.value ?? ''];
        default:
          return [f.key, ''];
      }
    }),
  );

/** The request body for a save: csv fields come back to arrays. */
export function toBody(editing, fields) {
  const body = { ...editing };
  // normalise csv fields to arrays
  fields
    .filter((f) => f.type === 'csv')
    .forEach((f) => {
      body[f.key] = String(body[f.key] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    });
  return body;
}
