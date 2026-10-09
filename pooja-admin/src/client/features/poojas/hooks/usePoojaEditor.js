import { useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { useConfirm, useToast } from '../../../ui/index.js';
import { blankPackage, blankPooja, slugify, toDraft, toPayload, validatePooja } from '../lib/pooja.js';

const move = (list, i, d) => {
  const next = list.slice();
  next.splice(i + d, 0, next.splice(i, 1)[0]);
  return next;
};

/**
 * The open pooja editor: the draft, validation, and saving as draft or
 * published. The list row may carry less than the document, so editing
 * fetches the full one first.
 */
export function usePoojaEditor({ onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(''); // '' | 'draft' | 'publish'
  const [opening, setOpening] = useState('');
  const initial = useRef('');

  const start = (d) => {
    initial.current = JSON.stringify(d);
    setErrors({});
    setDraft(d);
  };

  const openNew = () => start(toDraft(blankPooja()));

  const openEdit = async (row) => {
    setOpening(idOf(row));
    try {
      start(toDraft(await api.poojas.get(idOf(row))));
    } catch (e) {
      toast.error(`Could not open that. ${e.message}`);
    } finally {
      setOpening('');
    }
  };

  const dirty = () => !!draft && JSON.stringify(draft) !== initial.current;
  const close = async () => {
    if (dirty() && !(await confirm({ title: 'Discard changes?', message: 'This pooja has edits that are not saved.', confirmLabel: 'Discard', tone: 'danger' }))) return;
    setDraft(null);
  };

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  // A new pooja's slug follows its title until the operator edits the slug.
  const setTitle = (title) =>
    setDraft((d) => ({ ...d, title, ...(!idOf(d) && d.slug === slugify(d.title) ? { slug: slugify(title) } : {}) }));

  const addPackage = () => setDraft((d) => ({ ...d, packages: [...d.packages, blankPackage(Math.min(d.packages.length + 1, 12))] }));
  const setPackage = (cid, patch) => setDraft((d) => ({ ...d, packages: d.packages.map((p) => (p._cid === cid ? { ...p, ...patch } : p)) }));
  const movePackage = (i, dir) => setDraft((d) => ({ ...d, packages: move(d.packages, i, dir) }));
  const removePackage = (cid) => setDraft((d) => ({ ...d, packages: d.packages.filter((p) => p._cid !== cid) }));

  const save = async (publish) => {
    const found = validatePooja(draft, { publish });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(found.packagesGeneral || 'Fix the highlighted fields first');
      return;
    }
    setSaving(publish ? 'publish' : 'draft');
    try {
      const body = toPayload(draft, { enabled: publish });
      const id = idOf(draft);
      if (id) await api.poojas.update(id, body);
      else await api.poojas.create(body);
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
      setSaving('');
      return;
    }
    setSaving('');
    setDraft(null);
    toast.success(publish ? 'Saved and published' : 'Saved as draft');
    await onSaved();
  };

  return { draft, errors, saving, opening, openNew, openEdit, close, set, setTitle, addPackage, setPackage, movePackage, removePackage, save };
}
