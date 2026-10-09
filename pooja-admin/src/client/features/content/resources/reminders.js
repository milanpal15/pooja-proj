/** The temple's suggested daily cycle. A devotee's own alarms stay on their phone. */
const REMINDER_FIELDS = [
  { key: 'slug', label: 'Slug', type: 'text', col: true },
  { key: 'title', label: 'Title (EN)', type: 'text', col: true },
  { key: 'titleHi', label: 'Title (HI)', type: 'text' },
  { key: 'body', label: 'Notification text (EN)', type: 'text' },
  { key: 'bodyHi', label: 'Notification text (HI)', type: 'text' },
  { key: 'hour', label: 'Hour (0–23)', type: 'number', col: true },
  { key: 'minute', label: 'Minute', type: 'number', col: true },
  { key: 'icon', label: 'Icon', type: 'text' },
  { key: 'order', label: 'Order', type: 'number' },
  { key: 'enabled', label: 'Visible', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const reminderResource = {
  title: 'Reminder',
  resource: 'reminders',
  fields: REMINDER_FIELDS,
  previewKey: 'title',
};
