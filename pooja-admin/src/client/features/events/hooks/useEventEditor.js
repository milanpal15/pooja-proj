import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { idOf } from '../../../lib/ids.js';
import { useToast } from '../../../ui/index.js';
import { applyTypeDefaults, blankEvent, draftFrom, toBody, validateEvent } from '../lib/events.js';
import { normaliseFieldErrors } from '../lib/schema.js';

/**
 * One event being edited. `id` null = a new one. Local checks and the API's
 * 400 `bad_event` `fields` are the same { path: message } map; local ones show
 * after the first save attempt, the API's stay until the field is edited.
 *
 * `blocks` order and presence live in the draft; every block's values stay in
 * the draft when it is switched off (so toggling back loses nothing) but only
 * present blocks are sent.
 */
export function useEventEditor({ id, lookups }) {
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', error: '' });
  const [event, setEvent] = useState(null); // the stored document (null = new)
  const [draft, setDraft] = useState(null);
  const [base, setBase] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remote, setRemote] = useState({});
  const [warnings, setWarnings] = useState([]); // the last save's non-blocking notes (e.g. off_route)
  const kinds = lookups.kinds;
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;

  const open = useCallback((doc) => {
    const d = doc ? draftFrom(doc, kindsRef.current) : blankEvent();
    setEvent(doc || null);
    setDraft(d);
    setBase(JSON.stringify(d));
    setTried(false);
    setRemote({});
    setWarnings([]);
  }, []);

  useEffect(() => {
    let live = true;
    if (!id) {
      open(null);
      setState({ status: 'ready', error: '' });
      return undefined;
    }
    setState({ status: 'loading', error: '' });
    api.events.get(id).then(
      (doc) => { if (live) { open(doc); setState({ status: 'ready', error: '' }); } },
      (e) => { if (live) setState({ status: 'error', error: e.message, offline: !!e.offline }); },
    );
    return () => { live = false; };
  }, [id, open]);

  // Stored configs gain the registry's defaults once the kinds arrive.
  const kindsReady = kinds.length > 0;
  useEffect(() => {
    if (event && kindsReady && draft && JSON.stringify(draft) === base) {
      const d = draftFrom(event, kinds);
      setDraft(d);
      setBase(JSON.stringify(d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsReady]);

  const local = useMemo(() => (draft ? validateEvent(draft, kinds) : {}), [draft, kinds]);
  const errors = { ...(tried ? local : {}), ...remote };
  const dirty = !!draft && JSON.stringify(draft) !== base;

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); };
  const setBlock = (name, patch) => setDraft((d) => ({ ...d, [name]: { ...d[name], ...patch } }));
  const chooseType = (slug) => setDraft((d) => (event ? { ...d, typeSlug: slug } : applyTypeDefaults(d, lookups.typeOf(slug), kinds)));

  const save = async () => {
    setTried(true);
    if (!draft) return false;
    if (Object.keys(local).length) {
      toast.error('Fix the highlighted fields first.');
      return false;
    }
    setSaving(true);
    setRemote({});
    try {
      const body = toBody(draft, kinds);
      const saved = event ? await api.events.update(idOf(event), body) : await api.events.create(body);
      const doc = saved && typeof saved === 'object' ? saved.event ?? saved : null;
      const stored = doc && (idOf(doc) || doc.slug) ? { ...(event || {}), ...body, ...doc } : { ...(event || {}), ...body };
      toast.success(event ? 'Event saved' : 'Event created');
      open(stored);
      const w = saved?.warnings ?? doc?.warnings;
      setWarnings(Array.isArray(w) ? w : []);
      return stored;
    } catch (e) {
      if (e.code === 'bad_event' || e.body?.fields) {
        const f = normaliseFieldErrors(e.body?.fields);
        setRemote(f);
        toast.error(Object.keys(f).length ? 'The server rejected some fields. They are marked below.' : `Could not save. ${e.message}`);
      } else toast.error(`Could not save. ${e.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { state, event, draft, errors, remote, warnings, dirty, saving, set, setBlock, chooseType, save, isNew: !event };
}
