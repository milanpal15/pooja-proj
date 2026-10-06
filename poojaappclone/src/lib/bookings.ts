/**
 * The devotee's booked sevas.
 *
 * These used to live in this phone's AsyncStorage, seeded with two invented
 * bookings — Rudrabhishek at Kashi Vishwanath and a Modak Naivedya at
 * Siddhivinayak. Three things were wrong with that: every devotee saw the
 * same two, a reinstall lost the real ones, and the temple could not see a
 * single booking it had taken.
 *
 * Worse, the seed was returned whenever the stored list came back EMPTY, so
 * cancelling your last real booking resurrected the two demo ones.
 *
 * They are rows in MongoDB now, keyed to the Firebase uid, so they follow
 * the account rather than the handset.
 */
export {
  type BookedPooja,
  type NewBooking,
  deleteBooking as cancelBooking,
  fetchBookings as getBookedPoojas,
  postBooking as createBooking,
} from './api';
