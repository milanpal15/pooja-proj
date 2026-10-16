import { useEffect, useState } from 'react';

import { useLanguage } from '@/i18n';
import { type EventCard, fetchEvent } from '@/lib/api';

import { todayRow } from '../lib/progress';
import type { TodayRow } from '../components/EventCards';

/** At most this many Continue cards look their milestone up (each is one detail request). */
const MAX = 4;

/**
 * "Today: <milestone>" for the Continue cards: the server's `currentMilestoneKey` resolved to a title
 * from the event's own detail. When
 * the lookup fails the row is simply absent — nothing is guessed.
 */
export function useTodayRows(cards: EventCard[]): Record<string, TodayRow> {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<Record<string, TodayRow>>({});
  const slugs = cards.slice(0, MAX).map((c) => c.slug).join('|');

  useEffect(() => {
    let alive = true;
    const list = cards.slice(0, MAX);
    for (const card of list) {
      fetchEvent(card.slug)
        .then((d) => {
          if (alive) setRows((r) => ({ ...r, [card.slug]: todayRow(d.me?.currentMilestoneKey ?? card.me?.currentMilestoneKey, d.milestones?.items, lang) }));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
    // `slugs` identifies the cards; `lang` re-derives the title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs, lang]);

  return rows;
}
