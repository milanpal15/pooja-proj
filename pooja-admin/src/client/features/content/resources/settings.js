/** Single values: fees, support contacts. Stored as strings; the app coerces. */
const SETTING_FIELDS = [
  { key: 'key', label: 'Key', type: 'text', col: true },
  { key: 'value', label: 'Value', type: 'text', col: true },
  { key: 'label', label: 'Label', type: 'text', col: true },
  { key: 'desc', label: 'Description', type: 'text' },
];

/** The tab's wiring: which API collection, what a row is called. */
export const settingResource = {
  title: 'Setting',
  resource: 'settings',
  fields: SETTING_FIELDS,
  previewKey: 'label',
};
