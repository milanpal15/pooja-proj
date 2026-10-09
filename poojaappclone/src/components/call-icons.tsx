/**
 * Call-specific glyphs the shared icon set does not have (phone, mic, speaker).
 * Same grid and stroke as `Icon` so they sit beside it without looking foreign.
 */
import Svg, { Path } from 'react-native-svg';

export type CallIconName = 'phone' | 'phoneEnd' | 'mic' | 'micOff' | 'speaker' | 'sun';

const PATHS: Record<CallIconName, string[]> = {
  phone: [
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z',
  ],
  phoneEnd: [
    'M10.7 13.3a16 16 0 0 1-2.6-3.4l1.3-1.3a2 2 0 0 0 .5-2.1c-.3-.9-.6-1.8-.7-2.8A2 2 0 0 0 7.2 2H4.2a2 2 0 0 0-2 2.2 19.8 19.8 0 0 0 3 8.6',
    'M2 2l20 20',
  ],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  micOff: [
    'M2 2l20 20',
    'M9 9v3a3 3 0 0 0 5.1 2.1',
    'M15 9.3V5a3 3 0 0 0-5.7-1.3',
    'M19 10v2a7 7 0 0 1-.9 3.4',
    'M5 10v2a7 7 0 0 0 11.7 5.2',
    'M12 19v3',
  ],
  speaker: [
    'M11 5L6 9H2v6h4l5 4V5z',
    'M15.5 8.5a5 5 0 0 1 0 7',
    'M19 5a10 10 0 0 1 0 14',
  ],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  ],
};

export function CallIcon({
  name,
  size = 24,
  color,
}: {
  name: CallIconName;
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
