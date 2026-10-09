import type { IconName } from '@/components/ui';

const NAMES: readonly IconName[] = [
  'home', 'diya', 'temple', 'music', 'person', 'back', 'forward', 'close', 'check', 'bell', 'settings',
  'search', 'calendar', 'mapPin', 'star', 'heart', 'share', 'plus', 'minus', 'trash', 'play', 'pause',
  'globe', 'logout', 'sparkle', 'lotus', 'marigold', 'shankh', 'gift', 'support', 'google',
];

/** The dashboard stores an icon as free text; anything the app cannot draw becomes a sparkle. */
export function toIconName(name: string | undefined): IconName {
  return NAMES.includes(name as IconName) ? (name as IconName) : 'sparkle';
}
