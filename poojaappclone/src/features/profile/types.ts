import type { IconName } from '@/components/ui';

export type ProfileMenuItem = {
  icon: IconName;
  title: string;
  sub: string;
  onPress?: () => void;
  /** A row that is an on/off setting: shows a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (value: boolean) => void };
};
