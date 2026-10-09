import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';

/** The operator list, the two modal forms, and every write. Errors land in `err`. */
export function useOperators() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(null); // form object or null
  const [resetting, setResetting] = useState(null); // { id, username, password }

  const load = useCallback(async () => {
    try {
      setRows(await api.operators.list());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, fn) => {
    setBusy(id);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const create = async () => {
    setErr(null);
    setSaving(true);
    try {
      await api.operators.create(adding);
      setAdding(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setErr(null);
    setSaving(true);
    try {
      await api.operators.update(resetting.id, { password: resetting.password });
      setResetting(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return {
    rows,
    err,
    busy,
    saving,
    adding,
    setAdding,
    resetting,
    setResetting,
    create,
    resetPassword,
    setRole: (o, role) => act(o._id, () => api.operators.update(o._id, { role })),
    toggleActive: (o) => act(o._id, () => api.operators.update(o._id, { active: !o.active })),
    remove: (o) => act(o._id, () => api.operators.remove(o._id)),
  };
}
