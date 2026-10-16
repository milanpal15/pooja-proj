import { useMemo } from 'react';

import { useMyEventsTeaser, useUpcomingEventsTeaser } from '@/features/events';
import { useLanguage } from '@/i18n';
import { assetUrl } from '@/providers/content';

import { paramList } from '../lib/layout';
import { pick } from '../lib/pick';
import type { ShelfEntry } from './use-sources';

/** Events as shelf entries. `kind` is fixed for a block's lifetime, so the one hook it picks is stable. */
export function useEventsTeaserFeeds(kind: 'mine' | 'upcoming', params: Record<string, unknown>, limit: number) {
  const { lang } = useLanguage();
  const tags = paramList(params, 'tags');
  const useFeed = kind === 'mine' ? useMyEventsTeaser : useUpcomingEventsTeaser;
  const feed = useFeed(limit, tags);
  const data: ShelfEntry[] = useMemo(
    () =>
      feed.cards.map((c) => {
        const image = assetUrl(c.cover) ?? '';
        const href = `/events/${encodeURIComponent(c.slug)}`;
        return {
          key: c.slug,
          item: {
            key: c.slug,
            title: pick(lang === 'hi', c.title, c.titleHi),
            subtitle: pick(lang === 'hi', c.summary, c.summaryHi) || c.venueLabel || '',
            icon: '',
            image,
            badge: '',
            liveBadge: false,
            deitySlug: '',
            href,
            flag: '',
          },
        };
      }),
    [feed.cards, lang],
  );
  return { loading: feed.loading, data };
}
