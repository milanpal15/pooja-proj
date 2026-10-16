import { useMemo } from 'react';

import { useAnyLive } from '@/features/darshan';

import { columnsOf, inlineItems, tileStyleOf } from '../../lib/layout';
import { useNow } from '../../hooks/use-now';
import { toIconName } from '../../lib/icons';
import { Frame } from '../Frame';
import { QuickGrid, type QuickItem } from '../QuickGrid';
import { type BlockProps, useBlock } from './use-block';

/** Icon tiles from inline items. `liveBadge` shows LIVE only while some darshan stream really is live. */
export function QuickGridBlock({ block }: BlockProps) {
  const { t, hi, flags, open } = useBlock(block);
  const anyLive = useAnyLive();
  const columns = columnsOf(block);
  const tileStyle = tileStyleOf(block);
  const now = useNow(60_000); // a badge expires on its own

  const items = useMemo<(QuickItem & { href: string })[]>(
    () =>
      inlineItems(block, flags, hi, now).map((i) => ({
        key: i.key,
        label: i.title,
        icon: toIconName(i.icon),
        image: i.image || undefined,
        href: i.href,
        badge: i.liveBadge ? (anyLive ? t('hv_live') : undefined) : i.badge === 'new' ? t('hv_badge_new') : i.badge === 'soon' ? t('hv_badge_soon') : i.badge === 'special' ? t('hv_badge_special') : undefined,
      })),
    [block, flags, hi, now, anyLive, t],
  );

  if (!items.length) return null;
  return (
    <Frame>
      <QuickGrid items={items} columns={columns} tileStyle={tileStyle} onOpen={(href) => void open(href)} />
    </Frame>
  );
}
