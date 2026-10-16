import { useSource } from '../../hooks/use-sources';
import { sourceLimit, sourceParams } from '../../lib/layout';
import { AstrologerBlock as AstrologerCardBlock } from '../AstrologerBlock';
import { Frame } from '../Frame';
import { type BlockProps, useBlock } from './use-block';

/** The way into the astrologer list — always shown while the block is (it includes astrologers who are offline). */
export function AstrologerBlock({ block }: BlockProps) {
  const { follow } = useBlock(block);
  const feed = useSource('astrologers.online', { params: sourceParams(block), limit: sourceLimit(block) });
  return (
    <Frame>
      <AstrologerCardBlock list={feed.data} loading={feed.loading} onOpen={() => follow('/astrologers')} />
    </Frame>
  );
}
