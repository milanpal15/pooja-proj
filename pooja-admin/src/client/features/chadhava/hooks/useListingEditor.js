import { useRef, useState } from 'react';

import { idOf } from '../../../lib/ids.js';
import { useConfirm, useToast } from '../../../ui/index.js';
import { blankListing, blankOffering, slugify, toDraft, toPayload, validateListing } from '../lib/chadhava.js';

const move = (list, i, d) => {
  const next = list.slice();
  next.splice(i + d, 0, next.splice(i, 1)[0]);
  return next;
};

/** The open listing editor: draft (offerings included), validation, save, discard-guard. */
export function useListingEditor({ onSave }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const initial = useRef('');

  const open = (listing) => {
    const d = toDraft(listing || blankListing());
    initial.current = JSON.stringify(d);
    setErrors({});
    setDraft(d);
  };
  const close = async () => {
    if (JSON.stringify(draft) !== initial.current && !(await confirm({ title: 'Discard changes?', message: 'This listing has edits that are not saved.', confirmLabel: 'Discard', tone: 'danger' }))) return;
    setDraft(null);
  };

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setTitle = (title) => setDraft((d) => ({ ...d, title, ...(!idOf(d) && d.slug === slugify(d.title) ? { slug: slugify(title) } : {}) }));
  const addOffering = () => setDraft((d) => ({ ...d, offerings: [...d.offerings, blankOffering()] }));
  const setOffering = (cid, patch) => setDraft((d) => ({ ...d, offerings: d.offerings.map((o) => (o._cid === cid ? { ...o, ...patch } : o)) }));
  const moveOffering = (i, dir) => setDraft((d) => ({ ...d, offerings: move(d.offerings, i, dir) }));
  const removeOffering = (cid) => setDraft((d) => ({ ...d, offerings: d.offerings.filter((o) => o._cid !== cid) }));

  const save = async () => {
    const found = validateListing(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error('Fix the highlighted fields first');
      return;
    }
    setSaving(true);
    try {
      await onSave(toPayload(draft));
      setDraft(null);
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return { draft, errors, saving, open, close, set, setTitle, addOffering, setOffering, moveOffering, removeOffering, save };
}
