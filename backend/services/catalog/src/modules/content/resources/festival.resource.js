import { Festival } from '../models/festival.model.js';

// Sorted by date, not `order` — a calendar has one natural sequence.
export default { path: '/festivals', name: 'Festival', Model: Festival, sort: { date: 1 } };
