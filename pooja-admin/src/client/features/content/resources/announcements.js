import { api } from '../../../lib/api/index.js';

const ANNOUNCEMENT_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', col: true },
  { key: 'bodyMd', label: 'Body (Markdown)', type: 'textarea' },
  {
    key: 'severity',
    label: 'Severity',
    type: 'select',
    col: true,
    options: [
      { value: 'info', label: 'Info — general notice' },
      { value: 'festival', label: 'Festival — auspicious occasion' },
      { value: 'urgent', label: 'Urgent — needs attention now' },
    ],
  },
  {
    key: 'channels',
    label: 'Deliver via',
    type: 'enumList',
    col: true,
    options: [
      { value: 'modal', label: 'In-app modal only' },
      { value: 'push', label: 'Push notification only' },
      { value: 'modal,push', label: 'Both — modal and push' },
    ],
  },
  { key: 'dismissible', label: 'Dismissible', type: 'bool' },
  { key: 'active', label: 'Live', type: 'bool', col: true },
];

/** The tab's wiring: which API collection, what a row is called. */
export const announcementResource = {
  title: 'Announcement',
  resource: 'announcements',
  fields: ANNOUNCEMENT_FIELDS,
  previewKey: 'title',
  rowAction: {
    // Reaches every device, so it has its own area (admin only).
    area: 'push',
    label: 'Push',
    title: 'Send this as a push notification to every registered device',
    run: (row) => api.pushAnnouncement(row._id),
    done: (r) => `Sent ${r.sent}, failed ${r.failed}`,
  },
};
