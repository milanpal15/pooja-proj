import { useCallback, useEffect, useState } from 'react';

import { useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';

import { type AartiToRemind, loadReminders, toggleReminder } from '../lib/aarti-reminders';
import { aartiKey, type ReminderMap } from '../lib/live-logic';

/** Which aartis the devotee asked to be reminded of, and the switch for each. */
export function useAartiReminders() {
  const { t } = useLanguage();
  const toast = useToast();
  const [map, setMap] = useState<ReminderMap>({});

  useEffect(() => {
    let alive = true;
    loadReminders().then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isOn = useCallback(
    (streamSlug: string, time: string, name: string) => !!map[aartiKey(streamSlug, time, name)],
    [map],
  );

  const toggle = useCallback(
    async (a: AartiToRemind) => {
      const res = await toggleReminder(a);
      if (res === 'denied') toast.error(t('ld_remind_denied'));
      else if (res === 'unavailable') toast.error(t('ld_remind_unavailable'));
      else {
        setMap(await loadReminders());
        toast.success(t(res === 'on' ? 'ld_remind_set' : 'ld_remind_cleared'));
      }
    },
    [t, toast],
  );

  return { isOn, toggle };
}
