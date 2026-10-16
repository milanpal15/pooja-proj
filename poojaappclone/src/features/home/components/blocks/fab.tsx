import { toIconName } from '../../lib/icons';
import { propStr } from '../../lib/layout';
import { MusicFab } from '../MusicFab';
import { type BlockProps, useBlock } from './use-block';

/** Floats over the scroll; its label is the block title, its tap the block action (the Bhajan tab if none). */
export function FabBlock({ block }: BlockProps) {
  const { t, title, follow } = useBlock(block);
  return <MusicFab label={title || t('hv_listen')} icon={toIconName(propStr(block, 'icon') || 'music')} onPress={() => follow('/bhajan')} />;
}
