import { assetUrl, type RemoteReminder, type RemoteTone } from '@/providers/content';

import type { ReminderState, ResolvedReminder } from '../types';

import * as Alarm from './native-alarm';
import { parseTime } from './time';

/**
 * Merge the bundled cycle with the devotee's own, applying time overrides.
 *
 * Shared by the screen and by `sync`, so what is scheduled can never drift
 * from what is shown — the previous version read `REMINDERS` directly in
 * `sync`, which would have silently kept scheduling a deleted reminder.
 */
export function resolveReminders(state: ReminderState, cycle: RemoteReminder[]): ResolvedReminder[] {
  const builtIn = cycle
    .filter((d) => !state.removed.includes(d.slug))
    .map((d) => {
      const override = state.times[d.slug];
      const { hour, minute } = override ? parseTime(override) : { hour: d.hour, minute: d.minute };
      return {
        id: d.slug,
        title: d.title,
        titleHi: d.titleHi ?? d.title,
        body: d.body ?? '',
        bodyHi: d.bodyHi ?? d.body ?? '',
        hour,
        minute,
        icon: (d.icon ?? 'bell') as ResolvedReminder['icon'],
        custom: false,
      };
    });

  const own = (state.custom ?? []).map((r) => {
    const override = state.times[r.id];
    const { hour, minute } = override ? parseTime(override) : { hour: r.hour, minute: r.minute };
    return {
      id: r.id,
      title: r.title,
      titleHi: r.title,
      body: 'Your reminder.',
      bodyHi: 'आपका रिमाइंडर।',
      hour,
      minute,
      icon: 'bell' as ResolvedReminder['icon'],
      custom: true,
    };
  });

  return [...builtIn, ...own];
}

/**
 * What to hand the native alarm for a tone.
 *
 * `''` silence, `null` the device's own alarm sound, otherwise an absolute
 * URL. The field used to carry a bundled resource name like `bell`; no audio
 * ships in the app any more, so a leftover bare name resolves to the device
 * default rather than to nothing audible.
 */
function toneUri(tone: RemoteTone | undefined, silent: boolean): string | null {
  if (silent || tone?.sound === '') return '';
  const sound = tone?.sound;
  if (!sound || !/^(https?:\/\/|\/)/.test(sound)) return null;
  return assetUrl(sound) ?? null;
}

/**
 * Register this state's enabled reminders as real alarms, and report when
 * each will next ring.
 *
 * Module scope rather than a hook callback so the mount effect can call it
 * with the state it has just read from disk, without that state becoming an
 * effect dependency that re-arms on every change.
 */
export async function armAlarms(
  next: ReminderState,
  cycle: RemoteReminder[],
  tones: RemoteTone[],
): Promise<Record<string, number>> {
  const tone = tones.find((t) => t.slug === next.tone);
  const silent = next.tone === 'silent';
  const due = resolveReminders(next, cycle).filter((r) => next.enabled[r.id]);

  const at = await Alarm.setAlarms(
    due.map((def) => ({
      id: def.id,
      title: def.title,
      body: def.body,
      hour: def.hour,
      minute: def.minute,
      // '' is silence, null is the device's own alarm sound, anything
      // else is a URL the native side streams.
      sound: toneUri(tone, silent),
      vibrate: !silent,
    })),
  );
  return Object.fromEntries(at);
}

