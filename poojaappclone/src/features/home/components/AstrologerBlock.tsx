import { useLanguage } from '@/i18n';
import { fill, formatCoins } from '@/lib/format';
import type { Astrologer } from '@/lib/api';

import { AstrologerCard } from './AstrologerCard';
import { Skeleton } from './Skeleton';

/**
 * Astrologer card from the live list. It is ALWAYS shown while the feature is on — it is the way into the
 * full list, which includes astrologers who are offline. The online and rate lines appear only when the
 * list really says so, and with nobody online the button reads "See all" rather than "Talk now".
 */
export function AstrologerBlock({ list, loading, onOpen }: { list: Astrologer[] | undefined; loading: boolean; onOpen: () => void }) {
  const { t } = useLanguage();
  if (loading && !list) return <Skeleton style={{ height: 170 }} />;
  const rows = list ?? [];
  const online = rows.filter((a) => a.presence === 'online').length;
  const min = Math.min(...rows.map((a) => a.ratePerMin).filter((n) => n > 0));

  return (
    <AstrologerCard
      title={t('hv_astro_title')}
      sub={t('hv_astro_sub')}
      cta={online > 0 ? t('hv_astro_call') : t('hv_astro_all')}
      onlineLine={online > 0 ? fill(t('hv_astro_online'), { n: online }) : undefined}
      rateLine={Number.isFinite(min) ? fill(t('hv_astro_rate'), { n: formatCoins(min) }) : undefined}
      onPress={onOpen}
    />
  );
}
