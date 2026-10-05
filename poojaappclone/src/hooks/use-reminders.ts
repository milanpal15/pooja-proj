import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';


import { REMINDERS, type ReminderId, type ToneId, TONES } from '@/constants/reminders';

/**
 * Expo Go on Android cannot host these native modules, and the failure is not
 * catchable: `expo-notifications` throws from inside a side-effect module
 * during evaluation, which escapes a try/catch around the dynamic import and
 * surfaces as an uncaught error that takes the screen down.
 *
 * So the import is never attempted there. Detecting the runtime is the only
 * reliable guard — handling the error is not an option when the error refuses
 * to be handled.
 */
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';

/**
 * Daily aarti reminders, as repeating local notifications.
 *
 * Local rather than push, deliberately. These fire at 4:30am for Mangala
 * Aarti; they must not depend on a server, a network, or the push
 * infrastructure that Expo Go on Android no longer supports. Once scheduled
 * they are the operating system's problem, which is exactly where an alarm
 * belongs.
 *
 * State lives in AsyncStorage rather than being read back from the OS: the
 * scheduled-notification list is a poor source of truth (it is emptied by a
 * reinstall and reordered by the platform), and the settings screen needs to
 * render before any permission dialog has been answered.
 *
 * ── Why expo-notifications is loaded lazily ─────────────────────────────
 *
 * On Android, Expo Go throws the moment `expo-notifications` is IMPORTED —
 * not when a push method is called. Since expo-router loads routes eagerly, a
 * top-level import took down the entire app, not just this screen.
 *
 * So the module is pulled in on demand and every call site tolerates its
 * absence. In Expo Go the settings still render and persist, and the screen
 * says plainly that reminders need a development build; on a dev build the
 * same code schedules for real with nothing to change.
 */

type NotificationsModule = any;

let cached: NotificationsModule | null = null;
let attempted = false;

/** Returns the module, or null where the platform will not have it. */
async function loadNotifications(): Promise<NotificationsModule | null> {
  if (cached || attempted) return cached;
  attempted = true;
  if (IN_EXPO_GO && Platform.OS === 'android') return null;
  try {
    const mod = await import('expo-notifications');
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

export type ReminderState = {
  /** Which reminders are on. */
  enabled: Record<string, boolean>;
  /** Per-reminder time override, "HH:MM"; absent means the traditional time. */
  times: Record<string, string>;
  tone: ToneId;
};

const KEY = 'pooja.reminders';

const EMPTY: ReminderState = { enabled: {}, times: {}, tone: 'bell' };

export function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

export function formatTime(hour: number, minute: number, hi = false): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? (hi ? 'पूर्वाह्न' : 'AM') : hi ? 'अपराह्न' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

/**
 * One notification channel per tone.
 *
 * On Android 8+ the **channel** owns the sound — `content.sound` on an
 * individual notification is ignored once a channel exists. The app had a
 * single `reminders` channel and set the tone per notification, so choosing
 * "Temple Bell" changed nothing audible.
 *
 * A channel's sound is also immutable after creation, which is why each tone
 * gets its own channel rather than one channel being re-configured.
 *
 * The old channel passed `sound: 'default'`. That string is read as the name
 * of a bundled custom sound, not as "use the system default" — hence the
 * `Custom sound 'default' not found` error on every launch. Omitting `sound`
 * is how you ask for the system default.
 */
async function ensureToneChannels(N: NotificationsModule) {
  for (const tone of TONES) {
    const silent = tone.id === 'silent';
    await N.setNotificationChannelAsync(channelFor(tone.id), {
      name: `Aarti Reminders · ${tone.title}`,
      importance: silent ? N.AndroidImportance.LOW : N.AndroidImportance.HIGH,
      // Omitted entirely for the system default; `null` for silence.
      ...(silent ? { sound: null } : tone.sound ? { sound: tone.sound } : {}),
    });
  }
}

/** Channel id for a tone. Stable, because channels cannot be edited later. */
function channelFor(toneId: string) {
  return `reminders-${toneId}`;
}

export function useReminders() {
  const [state, setState] = useState<ReminderState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  /** Whether this build can schedule notifications at all. */
  const [supported, setSupported] = useState<'unknown' | 'yes' | 'no'>('unknown');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

    loadNotifications().then(async (N) => {
      if (!N) {
        setSupported('no');
        return;
      }
      setSupported('yes');
      try {
        const p = await N.getPermissionsAsync();
        setPermission(p.granted ? 'granted' : 'denied');
      } catch {
        setPermission('denied');
      }
    });
  }, []);

  const persist = useCallback((next: ReminderState) => {
    setState(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /** Ask only when the devotee turns something on, never on mount. */
  const ensurePermission = useCallback(async () => {
    const N = await loadNotifications();
    if (!N) return false;
    const current = await N.getPermissionsAsync();
    if (current.granted) {
      setPermission('granted');
      return true;
    }
    const asked = await N.requestPermissionsAsync();
    setPermission(asked.granted ? 'granted' : 'denied');
    return asked.granted;
  }, []);

  /**
   * Rebuild every scheduled notification from state.
   *
   * Cancel-all then re-add, rather than diffing: five reminders is nothing to
   * reschedule, and a diff has to stay correct against an OS list that other
   * code paths also touch. Idempotent beats clever here.
   */
  const sync = useCallback(
    async (next: ReminderState) => {
      const N = await loadNotifications();
      // Settings still save without the module; they take effect on a build
      // that has it.
      if (!N) return;
      // Channels must exist before anything is scheduled into them.
      if (Platform.OS === 'android') await ensureToneChannels(N);
      await N.cancelAllScheduledNotificationsAsync();

      const tone = TONES.find((t) => t.id === next.tone);
      const silent = next.tone === 'silent';

      for (const def of REMINDERS) {
        if (!next.enabled[def.id]) continue;
        const override = next.times[def.id];
        const { hour, minute } = override
          ? parseTime(override)
          : { hour: def.hour, minute: def.minute };

        await N.scheduleNotificationAsync({
          content: {
            title: def.title,
            body: def.body,
            // Android reads the sound off the channel; iOS reads it here.
            // Both are set so neither platform is left silent by accident.
            sound: silent ? undefined : (tone?.sound ?? undefined),
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
    },
    [],
  );

  const toggle = useCallback(
    async (id: ReminderId) => {
      const turningOn = !state.enabled[id];
      // Permission is only worth asking for where notifications exist. Where
      // they do not, the toggle still records the choice.
      if (turningOn && supported === 'yes' && !(await ensurePermission())) return false;

      const next: ReminderState = {
        ...state,
        enabled: { ...state.enabled, [id]: turningOn },
      };
      persist(next);
      await sync(next);
      return true;
    },
    [state, supported, ensurePermission, persist, sync],
  );

  const setTime = useCallback(
    async (id: ReminderId, hour: number, minute: number) => {
      const next: ReminderState = {
        ...state,
        times: { ...state.times, [id]: `${hour}:${String(minute).padStart(2, '0')}` },
      };
      persist(next);
      await sync(next);
    },
    [state, persist, sync],
  );

  const setTone = useCallback(
    async (tone: ToneId) => {
      const next = { ...state, tone };
      persist(next);
      // Re-scheduling is what actually changes the sound: a notification's
      // tone is baked in when it is scheduled, not read at fire time.
      await sync(next);
    },
    [state, persist, sync],
  );

  const activeCount = useMemo(
    () => REMINDERS.filter((r) => state.enabled[r.id]).length,
    [state.enabled],
  );

  /** Resolve a reminder's effective time, override or traditional. */
  const timeFor = useCallback(
    (id: ReminderId) => {
      const def = REMINDERS.find((r) => r.id === id)!;
      const override = state.times[id];
      return override ? parseTime(override) : { hour: def.hour, minute: def.minute };
    },
    [state.times],
  );

  return {
    state,
    loaded,
    permission,
    supported,
    activeCount,
    toggle,
    setTime,
    setTone,
    timeFor,
    ensurePermission,
    /** Android needs a channel before anything is shown; harmless elsewhere. */
    prepareChannel: useCallback(async () => {
      if (Platform.OS !== 'android') return;
      const N = await loadNotifications();
      if (!N) return;
      await ensureToneChannels(N);
    }, []),
  };
}
