import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, type ScrollView } from 'react-native';

import { toast, useConfirm } from '@/components/ui';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';

import type { ReminderId } from '../constants/reminders';
import { formatTime } from '../lib/time';
import type { AddDraft } from '../types';

import { useNow } from './use-now';
import { useReminders } from './use-reminders';

/**
 * Everything the Aarti Reminders screen does that is not drawing: the
 * reminder store, the edit/add state, the confirmations, and the clock the
 * "rings in" labels read against.
 */
export function useAlarmScreen() {
  const { lang, t } = useLanguage();
  const confirm = useConfirm();
  const hi = lang === 'hi';

  const store = useReminders();
  const { addReminder, prepareChannel, previewAlarm, removeReminder, state, toggle } = store;
  const { tones } = useContent();

  /*
   * `toggle` answers false when Android refuses the notification permission,
   * and the caller used to drop that on the floor — the switch simply did not
   * move and nothing said why. Android also stops showing its own dialog once
   * the devotee has declined, so the only way back is Settings; that makes
   * this a real choice, which is why it is a dialog rather than a toast.
   */
  const attemptToggle = useCallback(
    async (id: ReminderId) => {
      if (await toggle(id)) return;
      const open = await confirm({
        title: t('reminders_blocked_title'),
        message: t('reminders_blocked_msg'),
        confirmLabel: t('open_settings'),
        cancelLabel: t('cancel'),
      });
      if (open) void Linking.openSettings().catch(() => {});
    },
    [toggle, t, confirm],
  );
  const [editing, setEditing] = useState<ReminderId | null>(null);
  /** The add form, open or not. Null means closed. */
  const [adding, setAdding] = useState<AddDraft | null>(null);

  /*
   * Deleting is a real choice with a real cost, so it is a confirm dialog and
   * not a toast.
   */
  const confirmDelete = useCallback(
    async (id: ReminderId, title: string, custom: boolean) => {
      const yes = await confirm({
        title: hi ? 'रिमाइंडर हटाएँ?' : 'Delete this reminder?',
        message: custom
          ? hi
            ? `"${title}" हटा दिया जाएगा।`
            : `"${title}" will be removed.`
          : hi
            ? `"${title}" हटा दिया जाएगा। आप इसे बाद में वापस ला सकते हैं।`
            : `"${title}" will be removed. You can restore the daily cycle later.`,
        confirmLabel: hi ? 'हटाएँ' : 'Delete',
        cancelLabel: hi ? 'रहने दें' : 'Cancel',
        destructive: true,
      });
      if (!yes) return;
      setEditing(null);
      void removeReminder(id);
      toast.success(hi ? 'रिमाइंडर हटाया गया' : 'Reminder deleted');
    },
    [hi, removeReminder, confirm],
  );

  const submitNew = useCallback(async () => {
    if (!adding) return;
    const title = adding.title.trim();
    if (!title) {
      toast.error(hi ? 'नाम लिखें' : 'Give the reminder a name');
      return;
    }
    if (!(await addReminder(title, adding.hour, adding.minute))) {
      // The only way this fails is a refused notification permission, which
      // `attemptToggle` already explains; say so rather than failing mutely.
      toast.error(hi ? 'सूचनाओं की अनुमति चाहिए' : 'Notifications need to be allowed');
      return;
    }
    setAdding(null);
    toast.success(
      hi ? `${title} जोड़ा गया` : `${title} added for ${formatTime(adding.hour, adding.minute)}`,
    );
  }, [adding, addReminder, hi]);

  useEffect(() => {
    prepareChannel();
  }, [prepareChannel]);

  const now = useNow();

  /*
   * The add form is the last thing on the page and `autoFocus` raises the
   * keyboard over it, so opening it without scrolling left the devotee
   * typing into a field they could not see.
   */
  const scroller = useRef<ScrollView>(null);
  // Keyed to whether the form is open, not to `adding` itself — that object
  // changes on every keystroke, which would yank the list down as you type.
  const addOpen = adding !== null;
  useEffect(() => {
    if (!addOpen) return;
    const id = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 150);
    return () => clearTimeout(id);
  }, [addOpen]);

  // The tone list is the dashboard's, the same one the Ringtone screen
  // renders. Reading the bundled array here meant this row could name a
  // tone the picker no longer offered.
  const tone = tones.find((x) => x.slug === state.tone);

  /** Ring one now, and say how to stop it. */
  const preview = useCallback(
    (id: ReminderId) => {
      void previewAlarm(id).then((ok) => {
        if (ok) {
          toast.info(
            hi
              ? 'अभी बजा रहे हैं — बंद करने के लिए हटाएँ दबाएँ'
              : 'Ringing now — dismiss it from the alarm screen',
          );
        }
      });
    },
    [hi, previewAlarm],
  );

  return {
    ...store,
    hi,
    tone,
    now,
    scroller,
    editing,
    setEditing,
    adding,
    setAdding,
    attemptToggle,
    confirmDelete,
    submitNew,
    preview,
  };
}
