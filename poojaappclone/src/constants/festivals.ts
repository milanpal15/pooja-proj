/* ─────────────────────────────────────────────────── vrat & festivals ── */

export type Festival = {
  id: string;
  name: string;
  nameHi: string;
  /** ISO date. Compared against today to build the upcoming list. */
  date: string;
  deity: string;
};

/**
 * Bundled fallback festival calendar.
 *
 * ⚠️ **These dates expire.** Hindu festivals follow the lunar calendar, so
 * they move every year and cannot be computed from a Gregorian rule. This
 * list previously ran only to 2026-09-04, which meant `upcomingFestivals()`
 * silently returned nothing and the Home section rendered blank — a hardcoded
 * calendar rots exactly this quietly.
 *
 * Two mitigations, because one is not enough:
 *  1. `ContentProvider` prefers festivals served by the admin backend, so the
 *     dates can be corrected without shipping a build. This array is only the
 *     offline fallback.
 *  2. The Home section now renders an explicit empty state instead of a void.
 *
 * Verify against a panchang before each release — the entries below are
 * approximate and are there so the screen has something truthful-looking to
 * show offline, not as an authority on tithi.
 */
export const FESTIVALS: Festival[] = [
  { id: 'sharad-navratri', name: 'Sharad Navratri begins', nameHi: 'शारदीय नवरात्रि प्रारंभ', date: '2026-10-11', deity: 'durga' },
  { id: 'durga-ashtami', name: 'Durga Ashtami', nameHi: 'दुर्गा अष्टमी', date: '2026-10-18', deity: 'durga' },
  { id: 'dussehra', name: 'Vijayadashami', nameHi: 'विजयादशमी', date: '2026-10-20', deity: 'durga' },
  { id: 'karva-chauth', name: 'Karva Chauth', nameHi: 'करवा चौथ', date: '2026-10-29', deity: 'shiva' },
  { id: 'dhanteras', name: 'Dhanteras', nameHi: 'धनतेरस', date: '2026-11-06', deity: 'lakshmi' },
  { id: 'diwali', name: 'Diwali · Lakshmi Puja', nameHi: 'दिवाली · लक्ष्मी पूजा', date: '2026-11-08', deity: 'lakshmi' },
  { id: 'govardhan', name: 'Govardhan Puja', nameHi: 'गोवर्धन पूजा', date: '2026-11-09', deity: 'krishna' },
  { id: 'bhai-dooj', name: 'Bhai Dooj', nameHi: 'भाई दूज', date: '2026-11-10', deity: 'krishna' },
  { id: 'chhath', name: 'Chhath Puja', nameHi: 'छठ पूजा', date: '2026-11-15', deity: 'vishnu' },
  { id: 'gita-jayanti', name: 'Gita Jayanti', nameHi: 'गीता जयंती', date: '2026-12-20', deity: 'krishna' },
  { id: 'makar-sankranti', name: 'Makar Sankranti', nameHi: 'मकर संक्रांति', date: '2027-01-14', deity: 'vishnu' },
  { id: 'vasant-panchami', name: 'Vasant Panchami', nameHi: 'वसंत पंचमी', date: '2027-01-22', deity: 'lakshmi' },
  { id: 'maha-shivaratri', name: 'Maha Shivaratri', nameHi: 'महाशिवरात्रि', date: '2027-03-06', deity: 'shiva' },
  { id: 'holi', name: 'Holi', nameHi: 'होली', date: '2027-03-22', deity: 'krishna' },
  { id: 'ram-navami', name: 'Ram Navami', nameHi: 'राम नवमी', date: '2027-04-15', deity: 'vishnu' },
  { id: 'hanuman-jayanti', name: 'Hanuman Jayanti', nameHi: 'हनुमान जयंती', date: '2027-04-20', deity: 'hanuman' },
];
