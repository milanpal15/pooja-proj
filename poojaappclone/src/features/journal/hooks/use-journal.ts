import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';

import { MALA } from '../constants/mala';
import {
  dayKey,
  EMPTY_ENTRY,
  hasContent,
  type JournalMap,
  readJournal,
  writeEntry,
} from '../lib/journal-store';
import { getWeek, monthLabelFor } from '../lib/week';

/**
 * The journal for one day at a time: load, switch days, autosave, and the
 * week strip / mala progress derived from it.
 */
export function useJournal() {
  const { t, lang } = useLanguage();
  const toast = useToast();

  /** Which day is being written. Starts on today; the week strip moves it. */
  const [anchor, setAnchor] = useState(() => new Date());
  const [journal, setJournal] = useState<JournalMap>({});
  const [count, setCount] = useState(0);
  const [gratitude, setGratitude] = useState('');
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);

  const key = dayKey(anchor);
  const written = useMemo(
    () => new Set(Object.keys(journal).filter((k) => hasContent(journal[k]))),
    [journal],
  );
  const week = useMemo(() => getWeek(anchor, written), [anchor, written]);

  // Load the whole journal once; switching days then costs no storage read.
  useEffect(() => {
    let alive = true;
    readJournal().then((all) => {
      if (!alive) return;
      setJournal(all);
      const e = { ...EMPTY_ENTRY, ...all[dayKey()] };
      setCount(e.count);
      setGratitude(e.gratitude);
      setNotes(e.notes);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Swap the editor over to another day, showing whatever that day holds. */
  const selectDay = useCallback(
    (d: Date) => {
      const e = { ...EMPTY_ENTRY, ...journal[dayKey(d)] };
      setAnchor(d);
      setCount(e.count);
      setGratitude(e.gratitude);
      setNotes(e.notes);
    },
    [journal],
  );

  const shiftWeeks = useCallback(
    (weeks: number) => {
      const d = new Date(anchor);
      d.setDate(d.getDate() + weeks * 7);
      selectDay(d);
    },
    [anchor, selectDay],
  );

  /*
   * Autosave, debounced.
   *
   * The Save button used to be the only way to persist, and it only raised an
   * alert — so a devotee who counted a mala and backed out lost the lot. This
   * writes as they go; Save is now just the acknowledgement.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeEntry(key, { count, gratitude, notes }).then((all) => all && setJournal(all));
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loaded, key, count, gratitude, notes]);

  // One full mala per revolution, so 216 reads as two complete rounds.
  const progress = (count % MALA) / MALA || (count > 0 ? 1 : 0);

  const monthLabel = useMemo(() => monthLabelFor(anchor, lang), [anchor, lang]);

  const saveEntry = useCallback(async () => {
    const all = await writeEntry(key, { count, gratitude, notes });
    if (all) setJournal(all);
    toast.success(t('entry_saved'));
  }, [key, count, gratitude, notes, t, toast]);

  return {
    week,
    monthLabel,
    progress,
    count,
    setCount,
    gratitude,
    setGratitude,
    notes,
    setNotes,
    selectDay,
    shiftWeeks,
    saveEntry,
  };
}
