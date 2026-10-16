import { useSource } from '../../hooks/use-sources';
import { sourceLimit, sourceParams } from '../../lib/layout';
import { Frame } from '../Frame';
import { RashiRow } from '../RashiRow';
import { type BlockProps, useBlock } from './use-block';

export function RashiRowBlock({ block }: BlockProps) {
  const { t, title, linkLabel, follow } = useBlock(block);
  const feed = useSource('horoscope.today', { params: sourceParams(block), limit: sourceLimit(block) });
  if (!feed.data.length) return null;
  return (
    <Frame>
      <RashiRow rashis={feed.data} title={title || t('hv_rashifal')} link={linkLabel || t('hv_all_signs')} onOpen={() => follow('/horoscope')} />
    </Frame>
  );
}
