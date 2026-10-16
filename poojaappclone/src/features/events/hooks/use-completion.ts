import { useCallback, useState } from 'react';

import { useLanguage } from '@/i18n';
import type { CompletionSheet, EventDetail, ProgressResponse } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useWallet } from '@/providers/wallet';

import { cancelEventReminder, scheduleNextReminder } from '../lib/event-reminders';
import { fill } from '../lib/events-logic';
import { applyProgress } from '../lib/progress';

export type CompletionState = { completion: CompletionSheet; reminded: boolean } | null;

/**
 * What to do with a progress response, shared by the detail screen and the counter screen:
 *  - fold it into the detail (task state, milestone flag, `me`) and re-read the detail so the next
 *    milestone's unlock shows;
 *  - if coins were awarded, refresh the wallet (the response carries no balance);
 *  - if it carries a `completion`, show the sheet, and try to schedule the next-milestone reminder.
 *    `reminded` flips true only when a notification really exists (the sheet claims nothing otherwise).
 */
export function useCompletion(slug: string, event: EventDetail | null, mutate: (fn: (d: EventDetail) => EventDetail) => void, reload: () => void) {
  const { t, lang } = useLanguage();
  const { refresh } = useWallet();
  const [state, setState] = useState<CompletionState>(null);

  const onProgress = useCallback(
    (mKey: string, res: ProgressResponse) => {
      mutate((d) => applyProgress(d, mKey, res));
      if ((res.awarded?.coins ?? 0) > 0 || (res.completion?.coins ?? 0) > 0) void refresh();
      if (res.milestone?.justCompleted || res.event?.justCompleted || res.completion) reload();
      const c = res.completion;
      if (!c) return;
      setState({ completion: c, reminded: false });
      if (c.next && !c.eventCompleted) {
        const title = event ? pick(lang, event.title, event.titleHi) : '';
        void scheduleNextReminder({
          slug,
          title,
          body: fill(t('ev_remind_body'), { title: pick(lang, c.next.title, c.next.titleHi) }),
          opensAt: c.next.opensAt,
        }).then((ok) => {
          if (ok) setState((s) => (s && s.completion === c ? { ...s, reminded: true } : s));
        });
      } else {
        void cancelEventReminder(slug);
      }
    },
    [slug, event, lang, mutate, reload, refresh, t],
  );

  return { state, onProgress, dismiss: () => setState(null) };
}
