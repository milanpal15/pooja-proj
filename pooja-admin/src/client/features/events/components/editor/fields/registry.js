import { fieldsOf } from '../../../lib/schema.js';
import { PlaceField } from './PlaceField.jsx';

/**
 * The task-config form-field registry. `ConfigFields` draws every field of a
 * kind's `configSchema` generically; a GROUP widget takes over a set of
 * related fields that read better together. Matching is by what the schema
 * declares, never by the kind's name (docs/EVENTS.md §0 principle 1):
 *
 *   place - a schema with `lat` and `lng` (or `widget: 'place'`): a map picker
 *           for the point, a radius slider and the name / note fields.
 *
 * To add one: write the component, add an entry. Nothing else changes.
 */
export const GROUP_WIDGETS = [
  {
    id: 'place',
    match: (schema, keys) => (keys.includes('lat') && keys.includes('lng')) || schema?.widget === 'place' || schema?.['x-widget'] === 'place',
    consumes: ['lat', 'lng', 'radiusM', 'name', 'nameHi', 'note'],
    Component: PlaceField,
  },
];

/** The widget for a schema, or null; `keys` = the field keys the schema declares. */
export function groupWidgetFor(schema) {
  const keys = fieldsOf(schema).map((f) => f.key);
  const w = GROUP_WIDGETS.find((g) => g.match(schema, keys));
  return w ? { ...w, keys } : null;
}
