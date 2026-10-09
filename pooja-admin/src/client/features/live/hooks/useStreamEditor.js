import { useMemo, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { blankStream, draftFrom, toBody, validateStream } from '../lib/live.js';

/**
 * The stream being edited: `null` (closed), a draft for an existing stream
 * (`stream` set) or a new one. Errors show only after a save attempt.
 */
export function useStreamEditor({ streams, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(null); // { stream, draft, base }
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const taken = (open?.stream ? streams.filter((s) => idOf(s) !== idOf(open.stream)) : streams).map((s) => s.templeSlug);
  const errors = useMemo(() => (open ? validateStream(open.draft, { taken }) : {}), [open, taken.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!open && JSON.stringify(open.draft) !== open.base;

  const begin = (stream) => {
    const draft = stream ? draftFrom(stream) : blankStream();
    setOpen({ stream, draft, base: JSON.stringify(draft) });
    setTried(false);
  };
  const set = (patch) => setOpen((o) => (o ? { ...o, draft: { ...o.draft, ...patch } } : o));
  const close = () => setOpen(null);

  const save = async () => {
    setTried(true);
    if (!open || Object.keys(errors).length) return;
    setSaving(true);
    try {
      const body = toBody(open.draft);
      let saved;
      if (open.stream) saved = await api.liveStreams.update(idOf(open.stream), body);
      else saved = await api.liveStreams.create({ ...body, order: Math.max(0, ...streams.map((s) => s.order ?? 0)) + 10 });
      toast.success(open.stream ? 'Stream saved' : 'Stream added');
      await onSaved();
      const stored = { ...(open.stream || {}), ...body, ...(saved && typeof saved === 'object' ? saved : {}) };
      const draft = draftFrom(stored);
      setOpen({ stream: stored, draft, base: JSON.stringify(draft) });
      setTried(false);
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return { open, draft: open?.draft, stream: open?.stream, errors, shown: tried ? errors : {}, dirty, saving, begin, set, close, save };
}
