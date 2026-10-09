import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local persistence for the daily journal.
 *
 * One record per calendar day, keyed by the devotee's OWN date rather than
 * UTC — a japa session at 11pm IST belongs to that evening, not to tomorrow,
 * and `toISOString()` would have moved it. Everything here is best-effort: a
 * storage failure loses the write, never the screen.
 *
 * Entries stay on the device. The backend has no journal endpoint, and a
 * devotee's private reflections are the last thing to sync somewhere without
 * being asked.
 */

const STORAGE_KEY = '@pooja_journal';

export type JournalEntry = {
  /** Mantras chanted. Counted against a 108-bead mala. */
  count: number;
  gratitude: string;
  notes: string;
  /** Epoch ms of the last write, so a future sync can resolve conflicts. */
  updatedAt: number;
};

export type JournalMap = Record<string, JournalEntry>;

export const EMPTY_ENTRY: JournalEntry = { count: 0, gratitude: '', notes: '', updatedAt: 0 };

/** `YYYY-MM-DD` in LOCAL time. Not `toISOString()` — see the note above. */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** An entry counts as "written" if the devotee actually put something in it. */
export function hasContent(e: JournalEntry | undefined): boolean {
  return !!e && (e.count > 0 || !!e.gratitude.trim() || !!e.notes.trim());
}

export async function readJournal(): Promise<JournalMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Write one day's entry. A day the devotee has emptied out is deleted rather
 * than stored blank, so `hasContent` and the week dots agree with each other.
 */
export async function writeEntry(key: string, entry: Omit<JournalEntry, 'updatedAt'>) {
  try {
    const all = await readJournal();
    if (hasContent({ ...entry, updatedAt: 0 })) {
      all[key] = { ...entry, updatedAt: Date.now() };
    } else {
      delete all[key];
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return all;
  } catch {
    return null;
  }
}
