import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useToast } from '../../../ui/index.js';
import { roleLabel } from '../lib/roles.js';

/**
 * The operator list, the two modal forms, and every write. A table action
 * answers with a toast (success or the server's own reason, including its
 * lockout refusals: "This is the only admin left", "You cannot deactivate
 * yourself"); the two modals also keep the reason inline in `err`.
 */
export function useOperators() {
  const toast = useToast();
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

  const act = async (o, fn, done, failed) => {
    setBusy(o._id);
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (e) {
      toast.error(`${failed} ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const create = async () => {
    setErr(null);
    setSaving(true);
    try {
      const made = await api.operators.create(adding);
      toast.success(`Operator ${made?.username || adding.username} created as ${roleLabel(adding.role).toLowerCase()}`);
      setAdding(null);
      await load();
    } catch (e) {
      setErr(e.message);
      toast.error(`Could not create the operator. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setErr(null);
    setSaving(true);
    try {
      await api.operators.update(resetting.id, { password: resetting.password });
      toast.success(`Password changed for ${resetting.username}`);
      setResetting(null);
      await load();
    } catch (e) {
      setErr(e.message);
      toast.error(`Could not change the password. ${e.message}`);
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
    setRole: (o, role) =>
      act(o, () => api.operators.update(o._id, { role }), `${o.username}: role changed to ${roleLabel(role).toLowerCase()}`, 'Could not change the role.'),
    toggleActive: (o) =>
      act(
        o,
        () => api.operators.update(o._id, { active: !o.active }),
        o.active ? `Account ${o.username} disabled. They can no longer sign in.` : `Account ${o.username} enabled`,
        o.active ? 'Could not disable the account.' : 'Could not enable the account.',
      ),
    remove: (o) => act(o, () => api.operators.remove(o._id), `Operator ${o.username} deleted`, 'Could not delete the operator.'),
  };
}
