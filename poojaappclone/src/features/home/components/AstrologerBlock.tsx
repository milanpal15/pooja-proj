import { useLanguage } from '@/i18n';
import { fill, formatCoins } from '@/lib/format';
import type { Astrologer } from '@/lib/api';

import { AstrologerCard } from './AstrologerCard';
import { Skeleton } from './Skeleton';

/** Astrologer card from the live list; omitted when the list is empty or unreachable. */
export function AstrologerBlock({ list, loading, onOpen }: { list: Astrologer[] | undefined; loading: boolean; onOpen: () => void }) {
  const { t } = useLanguage();
  if (loading && !list) return <Skeleton style={{ height: 170 }} />;
  if (!list?.length) return null;

  const online = list.filter((a) => a.presence === 'online').length;
  const min = Math.min(...list.map((a) => a.ratePerMin).filter((n) => n > 0));

  return (
    <AstrologerCard
      title={t('hv_astro_title')}
      sub={t('hv_astro_sub')}
      cta={t('hv_astro_call')}
      onlineLine={online > 0 ? fill(t('hv_astro_online'), { n: online }) : undefined}
      rateLine={Number.isFinite(min) ? fill(t('hv_astro_rate'), { n: formatCoins(min) }) : undefined}
      onPress={onOpen}
    />
  );
}
