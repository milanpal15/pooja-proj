import { useCallback, useMemo, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { notifyApprovalsChanged } from '../../../lib/approvals-signal.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';
import { useToast } from '../../../ui/index.js';
import { explain, split } from '../lib/approvals.js';

/** Requests (all statuses), the approvals setting, and the four writes. Each write toasts, refetches and pokes the header bell. */
export function useApprovals() {
  const toast = useToast();
  const list = useLoader(() => api.approvals.list(''));
  const settings = useLoader(() => api.approvals.settings());
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    await Promise.all([list.reload(), settings.reload()]);
    notifyApprovalsChanged();
  }, [list.reload, settings.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    async (id, work, done, failed) => {
      setBusy(id);
      try {
        await work();
        toast.success(done);
        await refresh();
        return true;
      } catch (e) {
        toast.error(`${failed} ${explain(e)}`);
        await refresh();
        return false;
      } finally {
        setBusy('');
      }
    },
    [refresh, toast],
  );

  const { pending, history } = useMemo(() => split(list.data || []), [list.data]);

  return {
    status: list.status,
    error: list.error,
    offline: list.offline,
    reload: refresh,
    pending,
    history,
    busy,
    approvalsEnabled: settings.data?.approvalsEnabled !== false,
    settingsKnown: settings.status === 'ready' || settings.status === 'stale',
    approve: (r, note) => act(r._id, () => api.approvals.approve(r._id, note), 'Approved and applied', 'Could not approve.'),
    reject: (r, note) => act(r._id, () => api.approvals.reject(r._id, note), 'Rejected', 'Could not reject.'),
    cancel: (r) => act(r._id, () => api.approvals.cancel(r._id), 'Request cancelled', 'Could not cancel.'),
    setEnabled: async (on) => {
      setBusy('settings');
      try {
        await api.approvals.saveSettings(on);
        toast.success(on ? 'Approvals are on' : 'Approvals are off. Risky changes now apply immediately.');
        await refresh();
      } catch (e) {
        toast.error(`Could not change the setting. ${e.message}`);
      } finally {
        setBusy('');
      }
    },
  };
}
