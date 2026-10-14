import { Panchang } from './panchang.model.js';

/** Its CRUD rides on the content router (`/api/content/panchangs`). */
export default { path: '/panchangs', name: 'Panchang', Model: Panchang, sort: { date: -1 } };
