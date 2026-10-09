import type { IconName } from '@/components/ui';

import type { ToneId } from './constants/reminders';

/** A reminder the devotee added themselves. */
export type CustomReminder = {
  id: string;
  title: string;
  hour: number;
  minute: number;
};

export type ReminderState = {
  /** Which reminders are on. */
  enabled: Record<string, boolean>;
  /** Per-reminder time override, "HH:MM"; absent means the traditional time. */
  times: Record<string, string>;
  /** Reminders the devotee added. */
  custom: CustomReminder[];
  /**
   * Bundled reminders the devotee deleted.
   *
   * Recorded as a tombstone rather than by rewriting the list, because the
   * bundled five live in the app's code: a deletion that only removed them
   * from an array would come back on the next launch.
   */
  removed: string[];
  tone: ToneId;
};

/** A reminder as the screen needs it: merged, with its effective time. */
export type ResolvedReminder = {
  id: string;
  title: string;
  titleHi: string;
  body: string;
  bodyHi: string;
  hour: number;
  minute: number;
  icon: IconName;
  /** True for a devotee's own reminder, which can be renamed and deleted. */
  custom: boolean;
};

/** The add form, open or not. Null means closed. */
export type AddDraft = { title: string; hour: number; minute: number };
