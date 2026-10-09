import { Announcement } from './announcement.model.js';

/** Its CRUD rides on the content router (`/api/content/announcements`). */
export default { path: '/announcements', name: 'Announcement', Model: Announcement, sort: { createdAt: -1 } };
