import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Type } from '@/components/ui';
import { useTheme } from '@/theme';

import { progressRatio, ringDash } from '../lib/events-logic';

/** "4/9 done" ring. The arc is the server's `done`/`total`; with no total it draws only the track. */
export function Ring({ done, total, label, size = 76, thickness = 8 }: { done: number; total: number; label: string; size?: number; thickness?: number }) {
  const { c } = useTheme();
  const r = (size - thickness) / 2;
  const mid = size / 2;
  const [filled, rest] = ringDash(r, progressRatio({ done, total }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={mid} cy={mid} r={r} stroke={c.outlineVariant} strokeWidth={thickness} fill="none" />
        {filled > 0 && (
          <Circle
            cx={mid}
            cy={mid}
            r={r}
            stroke={c.primary}
            strokeWidth={thickness}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filled} ${rest}`}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        )}
      </Svg>
      <Type v="titleSm" numeric>{`${done}/${total}`}</Type>
      <Type v="labelSm" tone="onSurfaceVariant" style={{ fontSize: 10, lineHeight: 12 }}>
        {label}
      </Type>
    </View>
  );
}
