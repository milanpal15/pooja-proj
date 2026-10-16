import { useMemo } from 'react';

import type { EventCard, EventType } from '@/lib/api';

import { useEventsList } from './use-events-list';
import { useMyEvents } from './use-my-events';

export type EventsTeaserFeed = { cards: EventCard[]; types: EventType[]; loading: boolean };

/** Keep cards carrying ANY of `tags` (no tags = keep all), then cap at `limit`. */
function narrow(cards: EventCard[], tags: string[], limit: number): EventCard[] {
  const kept = tags.length ? cards.filter((c) => (c.tags ?? []).some((g) => tags.includes(g))) : cards;
  return kept.slice(0, limit);
}

/** The devotee's joined events for Home (empty for guests). */
export function useMyEventsTeaser(limit: number, tags: string[] = []): EventsTeaserFeed {
  const list = useEventsList();
  const mine = useMyEvents();
  const key = tags.join('|');
  const cards = useMemo(
    () => narrow(mine.data ?? list.data?.sections.mine ?? [], key ? key.split('|') : [], limit),
    [mine.data, list.data, key, limit],
  );
  return { cards, types: list.data?.types ?? [], loading: mine.loading && !mine.data };
}

/** This week's and upcoming events for Home, soonest first, each once. */
export function useUpcomingEventsTeaser(limit: number, tags: string[] = []): EventsTeaserFeed {
  const list = useEventsList();
  const key = tags.join('|');
  const cards = useMemo(() => {
    const s = list.data?.sections;
    const seen = new Set<string>();
    const all = [...(s?.thisWeek ?? []), ...(s?.upcoming ?? [])].filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)));
    return narrow(all, key ? key.split('|') : [], limit);
  }, [list.data, key, limit]);
  return { cards, types: list.data?.types ?? [], loading: list.loading && !list.data };
}
