import { propText } from '../../lib/layout';
import { Frame } from '../Frame';
import { ShareCard } from '../ShareCard';
import { type BlockProps, useBlock } from './use-block';

export function ShareBlock({ block }: BlockProps) {
  const { hi, title, subtitle } = useBlock(block);
  return (
    <Frame>
      <ShareCard title={title} sub={subtitle} message={propText(block, 'message', hi)} />
    </Frame>
  );
}
