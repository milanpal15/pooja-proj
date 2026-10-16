import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { qrMatrix, qrPath } from '@/lib/qr';

const QUIET = 2;

/** A QR code drawn as one SVG path (pure-TS encoder, `lib/qr.ts`). Renders nothing when the value does not fit. */
export function QrCode({ value, size, label }: { value: string; size: number; label?: string }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  if (!m) return null;
  const n = m.length + QUIET * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel={label} accessible={!!label}>
      <Rect width={n} height={n} fill="#FFFFFF" />
      <Path d={qrPath(m, QUIET)} fill="#241410" />
    </Svg>
  );
}
