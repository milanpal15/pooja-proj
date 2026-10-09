import { Platform } from 'react-native';

import type { RemoteReminder, RemoteTone } from '@/providers/content';

import type { ReminderState } from '../types';
import { channelFor, ensureToneChannels, type NotificationsModule } from './notifications';
import { resolveReminders } from './schedule';

/**
 * Schedule every enabled reminder as a daily `expo-notifications` entry,
 * replacing whatever was scheduled. The weaker path, used only where the
 * native alarm module is absent: a notification posts once at notification
 * volume and is scheduled inexactly.
 */
export async function scheduleFallbackNotifications(
  N: NotificationsModule,
  next: ReminderState,
  cycle: RemoteReminder[],
  tones: RemoteTone[],
) {
  // Channels must exist before anything is scheduled into them.
  if (Platform.OS === 'android') await ensureToneChannels(N, tones);
  /*
   * Only this screen's own entries are cleared. `cancelAll…` also wiped the Live Darshan "remind me"
   * notifications, which are scheduled by another feature; ours all carry `data.reminderId`.
   */
  const pending: { identifier: string; content?: { data?: Record<string, unknown> } }[] =
    await N.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (n.content?.data?.reminderId !== undefined) await N.cancelScheduledNotificationAsync(n.identifier);
  }

  for (const def of resolveReminders(next, cycle)) {
    if (!next.enabled[def.id]) continue;
    const { hour, minute } = def;

    await N.scheduleNotificationAsync({
      content: {
        title: def.title,
        body: def.body,
        /*
         * Android reads the sound off the channel. iOS reads it here and
         * wants the filename of a sound bundled with the app — which a
         * dashboard upload is not — so there is nothing to name, and the
         * device default is the honest answer on this fallback path.
         */
        data: { reminderId: def.id },
        ...(Platform.OS === 'android' ? { channelId: channelFor(next.tone) } : {}),
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }
}
