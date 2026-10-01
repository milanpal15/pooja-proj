import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BookedPooja {
  id: string;
  bookingRef: string;
  templeId: string;
  templeName: string;
  templeLocation: string;
  sevaId: string;
  sevaName: string;
  sevaNameHi: string;
  price: number;
  totalAmount: number;
  date: string; // ISO date string (YYYY-MM-DD)
  devoteeName: string;
  gotra?: string;
  prasad: boolean;
  status: 'upcoming' | 'completed';
  bookedAt: string; // ISO timestamp
}

const STORAGE_KEY = '@pooja_app_bookings';

const SEED_BOOKINGS: BookedPooja[] = [
  {
    id: 'bk_kashi_01',
    bookingRef: 'SM-2026-KV-4821',
    templeId: 'kashi-vishwanath',
    templeName: 'Kashi Vishwanath',
    templeLocation: 'Varanasi, Uttar Pradesh',
    sevaId: 'abhishek',
    sevaName: 'Rudrabhishek',
    sevaNameHi: 'रुद्राभिषेक',
    price: 1100,
    totalAmount: 1199,
    date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10), // in 2 days
    devoteeName: 'Devotee',
    gotra: 'Kashyap',
    prasad: true,
    status: 'upcoming',
    bookedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'bk_sid_02',
    bookingRef: 'SM-2026-SV-9124',
    templeId: 'siddhivinayak',
    templeName: 'Shree Siddhivinayak',
    templeLocation: 'Mumbai, Maharashtra',
    sevaId: 'modak',
    sevaName: 'Modak Naivedya',
    sevaNameHi: 'मोदक नैवेद्य',
    price: 501,
    totalAmount: 600,
    date: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10), // 3 days ago
    devoteeName: 'Devotee',
    gotra: 'Bharadwaj',
    prasad: true,
    status: 'completed',
    bookedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
];

/** Retrieve all booked poojas from AsyncStorage, seeding default demo bookings if empty. */
export async function getBookedPoojas(): Promise<BookedPooja[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_BOOKINGS));
      return SEED_BOOKINGS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return SEED_BOOKINGS;
  } catch {
    return SEED_BOOKINGS;
  }
}

/** Save a new booking to storage. */
export async function createBooking(
  item: Omit<BookedPooja, 'id' | 'bookingRef' | 'bookedAt' | 'status'> & {
    status?: 'upcoming' | 'completed';
  },
): Promise<BookedPooja> {
  const current = await getBookedPoojas();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const newBooking: BookedPooja = {
    ...item,
    id: `bk_${Date.now()}_${randomSuffix}`,
    bookingRef: `SM-${new Date().getFullYear()}-${item.templeId.slice(0, 2).toUpperCase()}-${randomSuffix}`,
    status: item.status ?? 'upcoming',
    bookedAt: new Date().toISOString(),
  };

  const updated = [newBooking, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  return newBooking;
}

/** Cancel / delete a booked pooja by id. */
export async function cancelBooking(id: string): Promise<BookedPooja[]> {
  const current = await getBookedPoojas();
  const updated = current.filter((b) => b.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  return updated;
}
