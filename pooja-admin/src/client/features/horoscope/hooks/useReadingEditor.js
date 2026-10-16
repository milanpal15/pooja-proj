import { useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useConfirm, useToast } from '../../../ui/index.js';
import { RASHIS } from '../constants/rashis.js';
import { blankReading } from '../lib/status.js';

/**
 * The reading being edited in the modal, and every write that goes with it:
 * save, delete, and the Hide/Publish toggle on a card. Failures are reported
 * through `setMsg` (the day panel's message line).
 */
export function useReadingEditor({ date, reload, setMsg }) {
  const confirm = useConfirm();
  const toast = useToast();
  const fail = (verb, e) => {
    setMsg(`Could not ${verb} — ${e.message}`);
    toast.error(`Could not ${verb}. ${e.message}`);
  };
  const nameOf = (r) => RASHIS.find((x) => x.value === r.rashi)?.name || 'Reading';
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
      toast.success(`${nameOf(row)} reading ${row.enabled ? 'hidden from' : 'shown in'} the app`);
    } catch (e) {
      fail('update', e);
    } finally {
      setBusyRow('');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const isNew = !editing._id;
      if (isNew) await api.horoscopes.create(editing);
      else await api.horoscopes.update(editing._id, editing);
      const name = nameOf(editing);
      setEditing(null);
      await reload();
      toast.success(isNew ? `${name} reading saved for ${editing.date}` : `${name} reading updated`);
    } catch (e) {
      fail('save', e);
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
      toast.success(`${s?.name || 'Reading'} reading for ${editing.date} deleted`);
    } catch (e) {
      fail('delete', e);
    }
  };

  return { editing, saving, busyRow, open, close, set, save, remove, toggleVisible };
}
