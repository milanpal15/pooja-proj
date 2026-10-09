import { useMemo, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { blankSlide, draftFrom, newSlug, toBody, validateSlide } from '../lib/slide.js';

/**
 * The slide being edited: `null` (nothing open), or a draft for an existing
 * slide (`slide` set) or a new one (`slide` null). Errors only appear after a
 * save attempt, then follow the fields as they are corrected.
 */
export function useSlideEditor({ slides, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(null); // { slide, draft, base }
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => (open ? validateSlide(open.draft) : {}), [open]);
  const dirty = !!open && JSON.stringify(open.draft) !== open.base;

  const begin = (slide) => {
    const draft = slide ? draftFrom(slide) : blankSlide();
    setOpen({ slide, draft, base: JSON.stringify(draft) });
    setTried(false);
  };
  const set = (patch) => setOpen((o) => (o ? { ...o, draft: { ...o.draft, ...patch } } : o));
  const close = () => setOpen(null);

  const save = async () => {
    setTried(true);
    if (!open || Object.keys(validateSlide(open.draft)).length) return;
    setSaving(true);
    try {
      let saved;
      if (open.slide) saved = await api.hero.update(idOf(open.slide), toBody(open.draft));
      else {
        const top = Math.max(0, ...slides.map((s) => s.order ?? 0));
        saved = await api.hero.create({ ...toBody(open.draft, { slug: newSlug(open.draft.title), order: top + 10 }), kind: 'banner' });
      }
      toast.success(open.slide ? 'Slide saved' : 'Slide added');
      await onSaved();
      // Keep it open on the saved version so "Live" and the table agree.
      const stored = { ...(open.slide || {}), ...(saved && typeof saved === 'object' ? saved : {}) };
      const draft = draftFrom({ ...stored, ...toBody(open.draft) });
      setOpen({ slide: stored, draft, base: JSON.stringify(draft) });
      setTried(false);
    } catch (e) {
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return { open, draft: open?.draft, slide: open?.slide, errors, shown: tried ? errors : {}, dirty, saving, begin, set, close, save };
}
