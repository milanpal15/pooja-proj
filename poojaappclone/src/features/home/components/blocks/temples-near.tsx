import { useSource } from '../../hooks/use-sources';
import { sourceLimit, sourceParams } from '../../lib/layout';
import { Frame } from '../Frame';
import { TemplesNearYou } from '../TemplesNearYou';
import { type BlockProps, useBlock } from './use-block';

export function TemplesNearBlock({ block }: BlockProps) {
  const { t, title, linkLabel, follow, go } = useBlock(block);
  const feed = useSource('temples.near_me', { params: sourceParams(block), limit: sourceLimit(block) });
  if (!feed.data.length) return null;
  return (
    <Frame>
      <TemplesNearYou
        temples={feed.data}
        title={title || t('hv_temples_near')}
        link={linkLabel || t('hv_view_map')}
        onLink={() => follow('/temples-map')}
        onOpen={go}
      />
    </Frame>
  );
}
