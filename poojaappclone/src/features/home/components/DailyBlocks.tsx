import { useLanguage } from '@/i18n';
import type { Coords } from '@/lib/geo';
import { useContent } from '@/providers/content';

import { useGo } from '../hooks/use-go';
import { useHomePanchang } from '../hooks/use-home-panchang';
import { deityForWeekday } from '../lib/weekday-deity';
import { summarisePanchang } from '../lib/panchang-summary';
import { DarshanCard } from './DarshanCard';
import { PanchangCard } from './PanchangCard';

/**
 * Today's darshan card and the panchang card. Both come from the on-device
 * panchang (works offline). The darshan card needs at least one deity from the
 * dashboard; the panchang card needs at least one computable cell. There is no
 * parikrama counter: no real progress data is exposed to Home, so none is drawn.
 */
export function DailyBlocks({ here }: { here: Coords | null }) {
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';
  const go = useGo();
  const { deityList, deityArt } = useContent();
  const p = useHomePanchang(here);

  const deity = deityForWeekday(deityList, new Date().getDay());
  const cells = p ? summarisePanchang(p, hi) : [];
  const line = p
    ? `॥ ${[hi ? p.varaHi : p.vara, hi ? p.masaHi : p.masa, hi ? p.tithiHi : p.tithi].filter(Boolean).join(', ')} ॥`
    : '';

  return (
    <>
      {deity && (
        <DarshanCard
          name={deity.name}
          art={deityArt(deity.id)}
          accent={deity.accent}
          line={line}
          title={t('hv_darshan_title')}
          sub={t('hv_darshan_sub')}
          cta={t('hv_enter')}
          onPress={() => go('/pooja')}
        />
      )}
      {cells.length > 0 && (
        <PanchangCard
          title={t('hv_panchang_title')}
          link={t('hv_calendar')}
          cells={cells}
          labels={{ tithi: t('hv_tithi'), nakshatra: t('hv_nakshatra'), sun: t('hv_sun'), rahu: t('hv_rahu') }}
          onCalendar={() => go('/panchang')}
        />
      )}
    </>
  );
}
