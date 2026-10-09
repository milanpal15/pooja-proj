import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useToast } from '../../../ui/index.js';

export function useUsers() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setRows(await api.users.list());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const write = async (work, failed) => {
    try {
      await work();
    } catch (e) {
      toast.error(`${failed} ${e.message}`);
      return;
    }
    load();
  };

  const toggleBlock = (u) =>
    write(() => api.users.update(u._id, { blocked: !u.blocked }), u.blocked ? 'Could not unblock.' : 'Could not block.');
  const remove = (u) => write(() => api.users.remove(u._id), 'Could not delete.');

  return { rows, err, reload: load, toggleBlock, remove };
}
