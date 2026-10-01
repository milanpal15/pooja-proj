import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@pooja_saved_temples';
const SEED_SAVED = ['kashi-vishwanath', 'siddhivinayak'];

/** Get saved temple IDs from AsyncStorage. */
export async function getSavedTempleIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_SAVED));
      return SEED_SAVED;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return SEED_SAVED;
  } catch {
    return SEED_SAVED;
  }
}

/** Add a temple ID to saved temples. */
export async function saveTemple(id: string): Promise<string[]> {
  const current = await getSavedTempleIds();
  if (current.includes(id)) return current;
  const updated = [...current, id];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  return updated;
}

/** Remove a temple ID from saved temples. */
export async function unsaveTemple(id: string): Promise<string[]> {
  const current = await getSavedTempleIds();
  const updated = current.filter((item) => item !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  return updated;
}

/** React hook for managing saved temples across the app. */
export function useSavedTemples() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const ids = await getSavedTempleIds();
      setSavedIds(ids);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSave = useCallback(async (id: string) => {
    setSavedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isSaved = useCallback((id: string) => savedIds.includes(id), [savedIds]);

  return { savedIds, isSaved, toggleSave, refresh: load, loading };
}
