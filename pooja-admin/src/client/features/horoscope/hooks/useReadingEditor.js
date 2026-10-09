import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useConfirm } from '../../../ui/index.js';
import { RASHIS } from '../constants/rashis.js';
import { blankReading } from '../lib/status.js';

/**
 * The reading being edited in the modal, and every write that goes with it:
 * save, delete, and the Hide/Publish toggle on a card. Failures are reported
 * through `setMsg` (the day panel's message line).
 */
export function useReadingEditor({ date, reload, setMsg }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState('');

  const open = (card) => setEditing(card.row ? { ...card.row } : blankReading(card.value, date));
  const close = () => setEditing(null);
  const set = (k, v) => setEditing((e) => ({ ...e, [k]: v }));

  const toggleVisible = async (row) => {
    setBusyRow(row._id);
    try {
      await api.horoscopes.update(row._id, { enabled: !row.enabled });
      await reload();
    } catch (e) {
      setMsg(`Could not update — ${e.message}`);
    } finally {
      setBusyRow('');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing._id) await api.horoscopes.update(editing._id, editing);
      else await api.horoscopes.create(editing);
      setEditing(null);
      await reload();
    } catch (e) {
      setMsg(`Could not save — ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const s = RASHIS.find((r) => r.value === editing.rashi);
    const ok = await confirm({
      title: 'Delete reading',
      message: `Delete the ${s?.name} reading for ${editing.date}?`,
      confirmLabel: 'Delete reading',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.horoscopes.remove(editing._id);
      setEditing(null);
      await reload();
    } catch (e) {
      setMsg(`Could not delete — ${e.message}`);
    }
  };

  return { editing, saving, busyRow, open, close, set, save, remove, toggleVisible };
}
