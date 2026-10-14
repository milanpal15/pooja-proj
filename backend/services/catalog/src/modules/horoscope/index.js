import { horoscopeAdmin, horoscopePublic } from './horoscope.routes.js';

/** `{ publicRouter, adminRouter }`: GET /horoscope is open; the day editor (/horoscope/day/:date) is area `horoscope`. */
export const horoscope = { publicRouter: horoscopePublic, adminRouter: horoscopeAdmin };
