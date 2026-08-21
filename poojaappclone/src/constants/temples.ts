/**
 * Temple catalogue for the selection carousel and the pooja screen.
 *
 * Each temple carries its own palette so the whole screen re-themes as the
 * user swipes between them.
 */

export type Deity = 'Shiva' | 'Ganesha' | 'Devi' | 'Vishnu';

export type Temple = {
  id: string;
  name: string;
  deity: Deity;
  /** Short devanagari mark drawn on the idol's halo. */
  mark: string;
  location: string;
  aarti: string;
  offerings: string[];
  /** Background wash, from top to bottom. */
  backdrop: [string, string];
  /** Primary accent — used for the halo, flame glow and buttons. */
  accent: string;
  /** Secondary accent for garlands and trim. */
  trim: string;
  /** Idol body / stone tone. */
  idol: string;
  /** Position on the pilgrimage map canvas, roughly following real geography. */
  map: { x: number; y: number };
  /** Real-world position — drives "near me" distance, and a native map later. */
  coords: { lat: number; lng: number };
};

/** Size of the scrollable map canvas the temple markers are placed on. */
export const MAP_W = 620;
export const MAP_H = 900;

export const TEMPLES: Temple[] = [
  {
    id: 'kashi',
    name: 'Kashi Vishwanath',
    deity: 'Shiva',
    mark: 'ॐ',
    location: 'Varanasi, Uttar Pradesh',
    aarti: 'Mangala Aarti · 3:00 AM',
    offerings: ['Bilva Patra', 'Ganga Jal', 'Dhatura'],
    backdrop: ['#2A1206', '#0B0503'],
    accent: '#FFB63D',
    trim: '#E4572E',
    idol: '#C9A227',
    map: { x: 330, y: 250 },
    coords: { lat: 25.3109, lng: 83.0107 },
  },
  {
    id: 'siddhivinayak',
    name: 'Shree Siddhivinayak',
    deity: 'Ganesha',
    mark: 'श्री',
    location: 'Prabhadevi, Mumbai',
    aarti: 'Kakad Aarti · 5:30 AM',
    offerings: ['Modak', 'Durva Grass', 'Red Hibiscus'],
    backdrop: ['#3A0F16', '#0A0405'],
    accent: '#FF7A45',
    trim: '#F2C14E',
    idol: '#E2703A',
    map: { x: 175, y: 470 },
    coords: { lat: 19.0169, lng: 72.8302 },
  },
  {
    id: 'meenakshi',
    name: 'Meenakshi Amman',
    deity: 'Devi',
    mark: 'ऐं',
    location: 'Madurai, Tamil Nadu',
    aarti: 'Palliyarai Pooja · 9:30 PM',
    offerings: ['Kumkum', 'Jasmine', 'Sarees'],
    backdrop: ['#10233A', '#04080F'],
    accent: '#4FD1C5',
    trim: '#F06595',
    idol: '#2F8F83',
    map: { x: 285, y: 780 },
    coords: { lat: 9.9195,  lng: 78.1193 },
  },
  {
    id: 'jagannath',
    name: 'Jagannath Dham',
    deity: 'Vishnu',
    mark: 'हरि',
    location: 'Puri, Odisha',
    aarti: 'Sandhya Aarti · 7:00 PM',
    offerings: ['Tulsi Leaves', 'Mahaprasad', 'Chandan'],
    backdrop: ['#2C1A3E', '#07040C'],
    accent: '#B794F4',
    trim: '#F6AD55',
    idol: '#6B46C1',
    map: { x: 430, y: 420 },
    coords: { lat: 19.8048, lng: 85.8180 },
  },
  {
    id: 'tirupati',
    name: 'Tirumala Balaji',
    deity: 'Vishnu',
    mark: 'ॐ',
    location: 'Tirumala, Andhra Pradesh',
    aarti: 'Suprabhata Seva · 4:30 AM',
    offerings: ['Tulsi Mala', 'Laddu', 'Chandan'],
    backdrop: ['#0F2A22', '#030907'],
    accent: '#F6E05E',
    trim: '#68D391',
    idol: '#276749',
    map: { x: 330, y: 660 },
    coords: { lat: 13.6833, lng: 79.3474 },
  },
];

export function templeById(id?: string | string[]) {
  const key = Array.isArray(id) ? id[0] : id;
  return TEMPLES.find((t) => t.id === key) ?? TEMPLES[0];
}

/** Number of full circles that completes one aarti. */
export const AARTI_CIRCLES = 5;
