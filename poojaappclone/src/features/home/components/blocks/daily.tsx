import { StyleSheet, View } from 'react-native';

import { useSource } from '../../hooks/use-sources';
import { Frame } from '../Frame';
import { DarshanCard } from '../DarshanCard';
import { PanchangCard } from '../PanchangCard';
import { type BlockProps, useBlock } from './use-block';

/**
 * Today's darshan card and the panchang card, both from the on-device panchang
 * (works offline). The darshan card needs a deity from the dashboard, the
 * panchang card at least one computable cell; with neither the block is omitted.
 */
export function DailyBlock({ block }: BlockProps) {
  const { t, go } = useBlock(block);
  const feed = useSource('daily.today', { params: {} });
  const { deity, panchang } = feed.data;
  const cells = panchang?.cells ?? [];
  if (!deity && !cells.length) return null;

  return (
    <Frame>
      <View style={styles.stack}>
        {deity && (
          <DarshanCard
            name={deity.name}
            art={deity.art}
            accent={deity.accent}
            line={panchang?.line ?? ''}
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
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({ stack: { gap: 24 } });
