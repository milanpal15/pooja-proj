import { ScrollView, StyleSheet } from 'react-native';

import { useScrollPadding } from '@/components/ui';

import { BLOCK_META, metaFor } from '../lib/block-meta';
import type { LayoutBlock } from '../lib/layout-types';
import { BlockBoundary } from './BlockBoundary';
import { BLOCKS } from './blocks';
import { FrameProvider } from './Frame';

const STACK_EXTRA = 8; // the scroll gap is 16; between two stack blocks it is 24

/** Identity for React: a block whose type or source changes remounts, so its hooks never change shape. */
function keyOf(b: LayoutBlock): string {
  return `${b.id}:${b.type}:${b.data?.mode === 'source' ? b.data.source : (b.data?.mode ?? '')}`;
}

/**
 * Draws the (already filtered) blocks. `pinned` blocks sit above the scroll
 * (the header), `float` blocks over it (the button), the rest scroll in
 * document order. Each block is isolated in its own error boundary and framed
 * by its own meta; nothing here knows what any block is.
 */
export function BlockList({ blocks }: { blocks: LayoutBlock[] }) {
  const pad = useScrollPadding(100);
  const place = (b: LayoutBlock) => metaFor(b.type)?.place;
  const flow = blocks.filter((b) => place(b) === 'flow');

  const render = (b: LayoutBlock, i: number, list: LayoutBlock[]) => {
    const meta = BLOCK_META[b.type as keyof typeof BLOCK_META];
    const Block = BLOCKS[b.type as keyof typeof BLOCKS];
    const prev = i > 0 ? BLOCK_META[list[i - 1].type as keyof typeof BLOCK_META] : undefined;
    const extraTop = meta.place === 'flow' && meta.group === 'stack' && prev?.group === 'stack' ? STACK_EXTRA : 0;
    return (
      <BlockBoundary key={keyOf(b)} blockId={b.id} type={b.type}>
        <FrameProvider value={{ frame: meta.frame, extraTop }}>
          <Block block={b} />
        </FrameProvider>
      </BlockBoundary>
    );
  };

  return (
    <>
      {blocks.filter((b) => place(b) === 'pinned').map((b, i, l) => render(b, i, l))}
      <ScrollView contentContainerStyle={[styles.scroll, pad]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {flow.map(render)}
      </ScrollView>
      {blocks.filter((b) => place(b) === 'float').map((b, i, l) => render(b, i, l))}
    </>
  );
}

const styles = StyleSheet.create({ scroll: { gap: 16, paddingTop: 2 } });
