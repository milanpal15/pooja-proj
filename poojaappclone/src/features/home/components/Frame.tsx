import { createContext, useContext } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FrameKind } from '../lib/block-meta';

type FrameValue = { frame: FrameKind; extraTop: number };

const FrameContext = createContext<FrameValue>({ frame: 'gutter', extraTop: 0 });
export const FrameProvider = FrameContext.Provider;

/**
 * A block's outer spacing, applied only when the block actually draws
 * something: a block that has no content returns null BEFORE reaching a Frame,
 * so it leaves no padded empty strip and no extra gap in the scroll.
 *
 * `gutter` blocks get the 16px side padding; `bleed` blocks (slider, deity
 * row) run edge to edge and pad themselves. `extraTop` is the 8px that turns
 * the scroll's 16px gap into the stack's 24px between two stacked blocks.
 */
export function Frame({ children }: { children: React.ReactNode }) {
  const { frame, extraTop } = useContext(FrameContext);
  if (frame === 'bleed' && !extraTop) return <>{children}</>;
  return <View style={[frame === 'gutter' && styles.gutter, !!extraTop && { marginTop: extraTop }]}>{children}</View>;
}

const styles = StyleSheet.create({ gutter: { paddingHorizontal: 16 } });
