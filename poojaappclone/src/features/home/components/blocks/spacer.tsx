import { View } from 'react-native';

import { propNum } from '../../lib/layout';
import type { BlockProps } from './use-block';

export function SpacerBlock({ block }: BlockProps) {
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ height: propNum(block, 'height', 16, 4, 96) }} />;
}
