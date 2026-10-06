import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';


import * as Alarm from '../../modules/expo-alarm';
import type { IconName } from '@/components/ui';
import { type ReminderId, type ToneId } from '@/constants/reminders';
import { assetUrl, type RemoteReminder, type RemoteTone, useContent } from '@/context/content';

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

const KEY = 'pooja.reminders';

const EMPTY: ReminderState = { enabled: {}, times: {}, custom: [], removed: [], tone: 'bell' };

/**
 * Merge the bundled cycle with the devotee's own, applying time overrides.
 *
 * Shared by the screen and by `sync`, so what is scheduled can never drift
 * from what is shown — the previous version read `REMINDERS` directly in
 * `sync`, which would have silently kept scheduling a deleted reminder.
 */
function resolveReminders(state: ReminderState, cycle: RemoteReminder[]): ResolvedReminder[] {
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
async function ensureToneChannels(N: NotificationsModule, tones: RemoteTone[]) {
  for (const tone of tones) {
    const silent = tone.slug === 'silent';
    await N.setNotificationChannelAsync(channelFor(tone.slug), {
      name: `Aarti Reminders · ${tone.title}`,
      importance: silent ? N.AndroidImportance.LOW : N.AndroidImportance.HIGH,
      /*
       * Omitted entirely for the system default; `null` for silence.
       *
       * An Android channel's sound must be a file bundled with the app, and
       * none is any more — every tone is uploaded from the dashboard. So
       * this path can only ask for the device's own sound. The tone the
       * devotee actually chose is played by the native alarm, which streams
       * it; the notification is what is left when the alarm did not fire.
       */
      ...(silent ? { sound: null } : {}),
    });
  }
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

/** Channel id for a tone. Stable, because channels cannot be edited later. */
function channelFor(toneId: string) {
  return `reminders-${toneId}`;
}

/**
 * Register this state's enabled reminders as real alarms, and report when
 * each will next ring.
 *
 * Module scope rather than a hook callback so the mount effect can call it
 * with the state it has just read from disk, without that state becoming an
 * effect dependency that re-arms on every change.
 */
async function armAlarms(
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

export function useReminders() {
  /*
   * The temple's suggested cycle and its alert tones come from the
   * dashboard. They used to be literals in `constants/reminders.ts`, so a
   * temple whose Mangala Aarti is at 4:00 rather than 4:30 could not say so
   * without shipping a new build.
   */
  const { reminders: cycle, tones } = useContent();

  const [state, setState] = useState<ReminderState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  /** Whether this build can schedule notifications at all. */
  const [supported, setSupported] = useState<'unknown' | 'yes' | 'no'>('unknown');
  /**
   * When each enabled reminder next goes off, epoch millis.
   *
   * The screen used to say nothing at all about this, so turning on a 6am
   * reminder at midday looked exactly like a reminder that did not work.
   */
  const [nextAt, setNextAt] = useState<Record<string, number>>({});

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(async (raw) => {
        const initial: ReminderState = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
        setState(initial);
        /*
         * Re-arm with the OS on every launch.
         *
         * Three things need this. A devotee updating from the version that
         * scheduled notifications has reminders switched on that nothing has
         * yet registered as alarms. Android loses alarms to reboots and to
         * some OEM cleanups. And `nextAt` — "rings in 11h 48m" — can only be
         * known by asking the scheduler, so without it the screen says
         * nothing about when anything will happen until a setting changes.
         */
        if (Alarm.isAvailable()) setNextAt(await armAlarms(initial, cycle, tones));
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
    // `cycle` and `tones` arrive from the network a moment after mount, so
    // the first pass arms nothing and the second arms the real thing. Both
    // are idempotent — setAlarms replaces the whole set every time.
  }, [cycle, tones]);

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

  const syncAlarms = useCallback(
    async (next: ReminderState) => {
      setNextAt(await armAlarms(next, cycle, tones));
    },
    [cycle, tones],
  );

  /**
   * Rebuild every scheduled reminder from state.
   *
   * Two completely different mechanisms, and the choice matters:
   *
   *  - **Android with the alarm module** — real alarms via
   *    `AlarmManager.setAlarmClock`, ringing on the alarm stream through a
   *    foreground service. Exact, audible on a silenced phone, loops until
   *    dismissed.
   *  - **Everything else** — `expo-notifications`, which posts once at
   *    notification volume and is scheduled inexactly. That is a reminder,
   *    not an alarm, and is the fallback precisely because it is weaker.
   *
   * Never both: two systems firing for one reminder means it goes off twice.
   */

  const sync = useCallback(
    async (next: ReminderState) => {
      if (Alarm.isAvailable()) {
        await syncAlarms(next);
        return;
      }

      const N = await loadNotifications();
      // Settings still save without the module; they take effect on a build
      // that has it.
      if (!N) return;
      // Channels must exist before anything is scheduled into them.
      if (Platform.OS === 'android') await ensureToneChannels(N, tones);
      await N.cancelAllScheduledNotificationsAsync();

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
    },
    [syncAlarms, cycle, tones],
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

  /**
   * Add a reminder of the devotee's own.
   *
   * It starts ON: adding one is already the statement of intent, and an
   * alarm that has to be switched on after being created reads as broken.
   * Permission is asked for here for the same reason it is asked on toggle.
   */
  const addReminder = useCallback(
    async (title: string, hour: number, minute: number) => {
      const clean = title.trim();
      if (!clean) return false;
      if (supported === 'yes' && !(await ensurePermission())) return false;

      const id = `custom-${Date.now().toString(36)}`;
      const next: ReminderState = {
        ...state,
        custom: [...(state.custom ?? []), { id, title: clean, hour, minute }],
        enabled: { ...state.enabled, [id]: true },
      };
      persist(next);
      await sync(next);
      return true;
    },
    [state, supported, ensurePermission, persist, sync],
  );

  /**
   * Delete a reminder.
   *
   * A devotee's own is dropped outright; a bundled one is tombstoned, since
   * it lives in the app's code and would otherwise return on next launch.
   * Either way its enabled flag and time override go with it, so re-adding
   * or restoring starts clean rather than inheriting a stale time.
   */
  const removeReminder = useCallback(
    async (id: ReminderId) => {
      const enabled = { ...state.enabled };
      const times = { ...state.times };
      delete enabled[id];
      delete times[id];

      const isCustom = (state.custom ?? []).some((r) => r.id === id);
      const next: ReminderState = {
        ...state,
        enabled,
        times,
        custom: isCustom ? state.custom.filter((r) => r.id !== id) : state.custom,
        removed: isCustom ? state.removed : [...new Set([...state.removed, id])],
      };
      persist(next);
      await sync(next);
    },
    [state, persist, sync],
  );

  /** Bring back the bundled cycle, so deleting them is not a one-way door. */
  const restoreDefaults = useCallback(async () => {
    const next: ReminderState = { ...state, removed: [] };
    persist(next);
    await sync(next);
  }, [state, persist, sync]);

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

  /** The list the screen renders: bundled minus deleted, plus the devotee's. */
  const reminders = useMemo(() => resolveReminders(state, cycle), [state, cycle]);

  const activeCount = useMemo(
    () => reminders.filter((r) => state.enabled[r.id]).length,
    [reminders, state.enabled],
  );

  /** Whether any bundled reminder has been deleted — gates "Restore". */
  const hasRemovedDefaults = state.removed.length > 0;

  /** Ring one now, so the devotee can hear it before 4:30am does. */
  const previewAlarm = useCallback(async (id: ReminderId) => {
    if (!Alarm.isAvailable()) return false;
    if (supported === 'yes' && !(await ensurePermission())) return false;
    // It has to exist natively before it can be previewed, and it only does
    // once it is enabled — so arm the current state first.
    await syncAlarms({ ...state, enabled: { ...state.enabled, [id]: true } });
    await Alarm.preview(id);
    return true;
  }, [state, supported, ensurePermission, syncAlarms]);

  return {
    state,
    loaded,
    permission,
    supported,
    /** True when reminders ring as real alarms rather than notifications. */
    isRealAlarm: Alarm.isAvailable(),
    /** False when Android 14+ has withheld the full-screen ring screen. */
    canFullScreen: Alarm.canUseFullScreen(),
    openFullScreenSettings: Alarm.openFullScreenSettings,
    /** False when alarms will ring late rather than to the minute. */
    canScheduleExact: Alarm.canScheduleExact(),
    openExactAlarmSettings: Alarm.openExactAlarmSettings,
    nextAt,
    previewAlarm,
    stopAlarm: Alarm.stop,
    reminders,
    activeCount,
    hasRemovedDefaults,
    toggle,
    setTime,
    setTone,
    addReminder,
    removeReminder,
    restoreDefaults,
    ensurePermission,
    /** Android needs a channel before anything is shown; harmless elsewhere. */
    prepareChannel: useCallback(async () => {
      if (Platform.OS !== 'android') return;
      const N = await loadNotifications();
      if (!N) return;
      await ensureToneChannels(N, tones);
    }, [tones]),
  };
}
