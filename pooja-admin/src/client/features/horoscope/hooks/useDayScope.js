import { useState } from 'react';

import { todayKey } from '../../../lib/dates.js';

// The Horoscope tab used to keep these in the dashboard shell, so leaving the
// tab and coming back found the same day open. The page now unmounts with its
// tab, so the choice is remembered here to keep that behaviour.
const remembered = { date: null, allDates: false };

/**
 * The Horoscope tab is scoped to one day: the bar and the table below it share
 * this date, so "Copy previous day", the published counter and the rows on
 * screen always describe the same editorial day. `allDates` swaps the day view
 * for the plain table.
 */
export function useDayScope() {
  const [date, setDate] = useState(() => remembered.date ?? todayKey());
  const [allDates, setAllDates] = useState(remembered.allDates);
  return {
    date,
    allDates,
    setDate: (d) => {
      remembered.date = d;
      setDate(d);
    },
    setAllDates: (v) => {
      remembered.allDates = v;
      setAllDates(v);
    },
  };
}
