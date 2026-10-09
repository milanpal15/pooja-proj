import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useToast } from '../../../ui/index.js';
import { toBody } from '../lib/fields.js';

/**
 * The state behind a ContentManager: the rows, the open edit form, and every
 * write (save, remove, in-place toggle, a row action, an upload).
 *
 * Writes re-fetch the list rather than patching it, except the boolean toggle,
 * which is optimistic and rolls back when the server refuses. A failed write
 * is a toast with the API's own sentence; the form stays open and the rows
 * stay as they were. Only a failed LOAD replaces the table (`err`).
 */
export function useContentResource({ resource, fields, rowAction, onChange }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null); // { message, offline } when the list could not load
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // form object or null
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [busyRow, setBusyRow] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await resource.list());
      setErr(null);
    } catch (e) {
      setErr({ message: e.message, offline: !!e.offline });
    } finally {
      setLoaded(true);
    }
  }, [resource]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body = toBody(editing, fields);
      if (body._id) await resource.update(body._id, body);
      else await resource.create(body);
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
      setSaving(false);
      return; // the modal stays open with what was typed
    }
    setSaving(false);
    setEditing(null);
    toast.success('Saved');
    await load();
    onChange?.();
  };

  /** Flip a boolean straight from the table, optimistically. */
  const toggleBool = async (row, key) => {
    const next = !row[key];
    setBusyRow(row._id);
    setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, [key]: next } : r)));
    try {
      await resource.update(row._id, { [key]: next });
      onChange?.();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, [key]: !next } : r)));
      toast.error(`Could not change that. ${e.message}`);
    } finally {
      setBusyRow('');
    }
  };

  const remove = async (row) => {
    try {
      await resource.remove(row._id);
    } catch (e) {
      toast.error(`Could not delete. ${e.message}`);
      return;
    }
    toast.success('Deleted');
    await load();
    onChange?.();
  };

  /** The row's custom action (e.g. Push); its result is announced in a toast. */
  const runRowAction = async (row) => {
    setBusyRow(row._id);
    try {
      const r = await rowAction.run(row);
      toast.success(rowAction.done ? rowAction.done(r) : 'Done');
      load();
    } catch (e) {
      toast.error(`${rowAction.label} failed. ${e.message}`);
    } finally {
      setBusyRow('');
    }
  };

  const onFile = async (field, file) => {
    if (!file) return;
    setUploading(field);
    try {
      const { url } = await api.upload(file);
      setEditing((e) => ({ ...e, [field]: url }));
    } catch (e) {
      toast.error(`Upload failed. ${e.message}`);
    } finally {
      setUploading('');
    }
  };

  const setField = (key, value) => setEditing((e) => ({ ...e, [key]: value }));

  return { rows, err, loaded, reload: load, editing, setEditing, setField, saving, uploading, busyRow, save, toggleBool, remove, runRowAction, onFile };
}
