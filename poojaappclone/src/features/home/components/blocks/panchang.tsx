import { useSource } from '../../hooks/use-sources';
import { Frame } from '../Frame';
import { PanchangCard } from '../PanchangCard';
import { type BlockProps, useBlock } from './use-block';

/** Today's panchang card. Missing cells are absent; with none computable the block is omitted. */
export function PanchangBlock({ block }: BlockProps) {
  const { t, title, linkLabel, follow } = useBlock(block);
  const feed = useSource('panchang.today', { params: {} });
  const cells = feed.data?.cells ?? [];
  if (!cells.length) return null;

  return (
    <Frame>
      <PanchangCard
        title={title || t('hv_panchang_title')}
        link={linkLabel || t('hv_calendar')}
        cells={cells}
        labels={{ tithi: t('hv_tithi'), nakshatra: t('hv_nakshatra'), sun: t('hv_sun'), rahu: t('hv_rahu') }}
        onCalendar={() => follow('/panchang')}
      />
    </Frame>
  );
}
