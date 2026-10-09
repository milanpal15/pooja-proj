import { useState } from 'react';

import { useToast } from '../../../ui/index.js';
import { blankItem, sourceOf } from '../lib/sources.js';

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A new custom section, last in the list. */
export const newSection = (sections) => ({
  source: 'custom',
  key: '',
  title: '',
  titleHi: '',
  tone: 'gold',
  layout: 'photo3',
  items: [blankItem()],
  footerLabel: '',
  footerLabelHi: '',
  footerHref: '',
  startsAt: null,
  endsAt: null,
  order: Math.max(0, ...sections.map((s) => s.order ?? 0)) + 10,
  enabled: true,
});

/** What is wrong with a section before it is sent ({} when nothing). */
export function validateSection(s) {
  const errors = {};
  const src = sourceOf(s);
  if (s.source === 'custom' && !s.title.trim()) errors.title = 'Give the section a title';
  if (s.startsAt && s.endsAt && new Date(s.startsAt) > new Date(s.endsAt)) errors.endsAt = '“Show until” is before “Show from”';
  if (src.deities && !s.items.some((i) => i.deitySlug)) errors.items = 'Choose at least one deity';
  if (src.items && s.source === 'custom') {
    if (s.items.some((i) => !i.title.trim())) errors.items = 'Every item needs a title';
  }
  return errors;
}

/** Drops blank rows from the items before sending; a key is derived once for a new custom section. */
export function toPayload(s, existingKeys) {
  const out = { ...s, items: (s.items || []).filter((i) => i.title?.trim() || i.deitySlug) };
  if (!out.key) {
    const base = slug(out.title) || 'section';
    let key = base;
    for (let n = 2; existingKeys.includes(key); n += 1) key = `${base}-${n}`;
    out.key = key;
  }
  return out;
}

/** The open section editor: draft, validation, save. */
export function useSectionEditor({ sections, onSave }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const open = (section) => {
    setErrors({});
    setDraft(section ? { ...section, items: (section.items || []).map((i) => ({ ...blankItem(), ...i })) } : newSection(sections));
  };
  const close = () => setDraft(null);
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const found = validateSection(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await onSave(toPayload(draft, sections.map((s) => s.key)));
      setDraft(null);
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return { draft, errors, saving, open, close, set, save };
}
