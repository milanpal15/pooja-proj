import { Horoscope } from './horoscope.model.js';

/** Its CRUD rides on the content router (`/api/content/horoscopes`). */
export default { path: '/horoscopes', name: 'Horoscope', Model: Horoscope, sort: { date: -1, rashi: 1 } };
