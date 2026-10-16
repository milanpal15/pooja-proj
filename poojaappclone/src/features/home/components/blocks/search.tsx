import { propText } from '../../lib/layout';
import { searchPath } from '../../lib/search';
import { Frame } from '../Frame';
import { SearchBar } from '../SearchBar';
import { type BlockProps, useBlock } from './use-block';

export function SearchBlock({ block }: BlockProps) {
  const { t, hi, go } = useBlock(block);
  return (
    <Frame>
      <SearchBar placeholder={propText(block, 'placeholder', hi) || t('hv_search')} onPress={() => go(searchPath(''))} />
    </Frame>
  );
}
