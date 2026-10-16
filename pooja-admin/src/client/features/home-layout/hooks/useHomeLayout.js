import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useUnsavedGuard } from '../../../lib/hooks/useUnsavedGuard.js';
import { useToast } from '../../../ui/index.js';
import { activeEntries, indexErrors, mapErrors } from '../lib/errors.js';
import {
  DEFAULT_ID, MAX_LAYOUTS, addLayout, allBlockIds, blankBlock, blankLayoutBlocks, copyLayout, duplicateBlock, findLayout, fingerprint, fixedCount, insertBlock,
  layoutIdFor, mapBlocks, moveBlock, moveBlockTo, moveLayout, normaliseDoc, orderedLayouts, patchBlock, patchLayout, removeBlock, removeLayout, toBody, warnings,
} from '../lib/layout.js';
import { EMPTY_REGISTRY, normaliseRegistry } from '../lib/registry.js';

const EMPTY_ERRORS = { entries: [], global: [] };
const EMPTY_DOC = normaliseDoc(null);
const metaOf = (s) => ({ draft: s.draft, published: s.published, history: s.history || [], changes: Number(s.changes) || 0, dirty: !!s.dirty });

/**
 * The Home layout draft (a SET of layouts, docs/HOME_LAYOUT.md §9) and everything
 * done to it: load, edit (layouts and their sections), validate, save, publish,
 * discard, roll back, reset.
 *
 * Nothing is autosaved. `unsaved` is "the working copy differs from the last saved
 * draft"; `meta.changes` is the server's count of differences between the saved draft
 * and the live set. A refused document comes back as `errors`, keyed by layout and
 * block id (reorder-safe) plus `global` ones that belong to no layout.
 */
export function useHomeLayout() {
  const toast = useToast();
  const [load, setLoad] = useState({ status: 'loading', error: '', offline: false });
  const [reg, setReg] = useState(EMPTY_REGISTRY);
  const [doc, setDoc] = useState(EMPTY_DOC);
  const [activeId, setActiveId] = useState(DEFAULT_ID);
  const [base, setBase] = useState('');
  const [meta, setMeta] = useState({ draft: null, published: null, history: [], changes: 0, dirty: false });
  const [errs, setErrs] = useState(EMPTY_ERRORS);
  const [busy, setBusy] = useState(''); // '' | 'save' | 'validate' | 'publish' | 'rollback' | 'reset' | 'discard'
  const removed = useRef(new Set()); // block and layout ids used and gone this session: an id is never reused
  const regRef = useRef(reg);
  regRef.current = reg;
  const docRef = useRef(doc);
  docRef.current = doc;

  const adopt = useCallback((draft, registry) => {
    const d = normaliseDoc(draft);
    setDoc(d);
    setActiveId((id) => (d.layouts.some((l) => l.id === id) ? id : (d.layouts.find((l) => l.id === DEFAULT_ID) || d.layouts[0])?.id || DEFAULT_ID));
    setBase(fingerprint(d, registry));
    setErrs(EMPTY_ERRORS);
  }, []);

  const reload = useCallback(async () => {
    setLoad((l) => ({ ...l, status: l.status === 'ready' ? 'ready' : 'loading' }));
    try {
      const [state, raw] = await Promise.all([api.homeLayout.get(), api.homeLayout.registry()]);
      const registry = normaliseRegistry(raw);
      setReg(registry);
      setMeta(metaOf(state));
      adopt(state.draft, registry);
      setLoad({ status: 'ready', error: '', offline: false });
    } catch (e) {
      setLoad({ status: 'error', error: e.message, offline: !!e.offline });
    }
  }, [adopt]);

  useEffect(() => { reload(); }, [reload]);

  /** Server-side facts about the saved draft, without touching the working copy. */
  const refreshMeta = useCallback(async () => {
    try {
      const s = await api.homeLayout.get();
      setMeta(metaOf(s));
      return s;
    } catch {
      return null;
    }
  }, []);

  const unsaved = useMemo(() => load.status === 'ready' && fingerprint(doc, reg) !== base, [doc, reg, base, load.status]);
  const layouts = useMemo(() => orderedLayouts(doc), [doc]);
  const active = findLayout(doc, activeId) || layouts[0] || null;
  const fixed = useMemo(() => fixedCount(active?.blocks || [], reg), [active, reg]);
  const activeErrors = useMemo(() => activeEntries(errs.entries, doc), [errs, doc]);
  const indexed = useMemo(() => indexErrors(activeErrors), [activeErrors]);
  const notes = useMemo(() => warnings(doc, reg), [doc, reg]);

  /* ---- section edits: all pure functions over the active layout's blocks (lib/layout.js) ---- */
  const lid = active?.id;
  const edit = (fn) => setDoc((d) => mapBlocks(d, lid, fn));
  const patch = (id, p) => edit((bs) => patchBlock(bs, id, p));
  const move = (id, delta) => edit((bs) => moveBlock(bs, id, delta, fixedCount(bs, regRef.current)));
  const moveTo = (id, to) => edit((bs) => moveBlockTo(bs, id, to, fixedCount(bs, regRef.current)));
  const remove = (id) => {
    removed.current.add(id);
    edit((bs) => removeBlock(bs, id, fixedCount(bs, regRef.current)));
  };
  const add = (type, afterId) => {
    const block = blankBlock(type, regRef.current, [...allBlockIds(docRef.current), ...removed.current]);
    edit((bs) => insertBlock(bs, block, afterId, fixedCount(bs, regRef.current)));
    return block.id;
  };
  const duplicate = (id) => {
    const r = duplicateBlock(active.blocks, id, [...allBlockIds(doc), ...removed.current], undefined, fixed);
    if (r.id) setDoc((d) => mapBlocks(d, lid, () => r.blocks));
    return r.id;
  };

  /* ---- layout edits ---- */
  const takenLayoutIds = () => [...doc.layouts.map((l) => l.id), ...[...removed.current].filter((x) => !x.startsWith('b-'))];

  /** New layout. `from`: a layout id to copy, or '' for a blank one (just the fixed top blocks). Returns its id, or '' if refused. */
  const createLayout = ({ name, startsAt, endsAt, audience, from, enabled = true }) => {
    if (doc.layouts.length >= MAX_LAYOUTS) { toast.error(`At most ${MAX_LAYOUTS} layouts.`); return ''; }
    const id = layoutIdFor(name, takenLayoutIds());
    const src = findLayout(doc, from);
    const l = src
      ? copyLayout(src, { id, name, enabled, audience, startsAt, endsAt })
      : { id, name, enabled, audience, startsAt, endsAt, blocks: blankLayoutBlocks(findLayout(doc, DEFAULT_ID) || doc.layouts[0], regRef.current) };
    setDoc((d) => addLayout(d, l));
    setActiveId(id);
    return id;
  };
  const updateLayout = (id, p) => setDoc((d) => patchLayout(d, id, p));
  const duplicateLayout = (id) => {
    const src = findLayout(doc, id);
    if (!src) return '';
    const copy = createLayout({ name: `${src.name} copy`, from: id, audience: [], startsAt: null, endsAt: null, enabled: false });
    return copy;
  };
  const deleteLayout = (id) => {
    if (id === DEFAULT_ID) return;
    removed.current.add(id);
    const next = removeLayout(doc, id);
    setDoc(next);
    if (activeId === id) setActiveId(DEFAULT_ID);
  };
  const moveActive = (id, delta) => setDoc((d) => moveLayout(d, id, delta));

  /** Replace the whole document (JSON tab → Apply). */
  const replace = (next) => {
    allBlockIds(doc).forEach((b) => removed.current.add(b));
    setDoc(next);
    setActiveId((id) => (next.layouts.some((l) => l.id === id) ? id : (next.layouts.find((l) => l.id === DEFAULT_ID) || next.layouts[0])?.id || DEFAULT_ID));
  };

  /** Turn a refused response into mapped errors; the count, or 0 if it was not one. */
  const refused = useCallback((e, d) => {
    if (e.code === 'bad_layout' || e.body?.fields) {
      const m = mapErrors(e.body?.fields, d);
      setErrs(m);
      return m.entries.length + m.global.length;
    }
    return 0;
  }, []);

  const report = (what, e, d) => {
    const n = refused(e, d);
    toast.error(n ? `The server refused the layout: ${n} ${n === 1 ? 'problem is' : 'problems are'} listed above.` : `${what} ${e.message}`);
    return false;
  };

  const save = async () => {
    setBusy('save');
    try {
      await api.homeLayout.saveDraft(toBody(doc, reg));
      setBase(fingerprint(doc, reg));
      setErrs(EMPTY_ERRORS);
      await refreshMeta();
      toast.success('Draft saved');
      return true;
    } catch (e) {
      return report('Could not save the draft.', e, doc);
    } finally {
      setBusy('');
    }
  };

  /**
   * Ask the server to check a document (default: the working copy). Saves nothing.
   * For the working copy the errors land in `errors`; for any other document
   * (the JSON tab's text) they are only returned, mapped onto that document.
   */
  const validate = async (custom) => {
    const own = !custom;
    const body = own ? toBody(doc, reg) : custom;
    const target = own ? doc : custom;
    setBusy('validate');
    try {
      await api.homeLayout.validate(body);
      if (own) setErrs(EMPTY_ERRORS);
      return { ok: true, entries: [], global: [] };
    } catch (e) {
      if (e.code === 'bad_layout' || e.body?.fields) {
        const m = mapErrors(e.body?.fields, target);
        if (own) setErrs(m);
        return { ok: false, ...m, doc: target, message: e.message };
      }
      return { ok: false, entries: [], global: [], message: e.message, failed: true };
    } finally {
      setBusy('');
    }
  };

  const publish = async (note) => {
    setBusy('publish');
    try {
      if (unsaved) {
        await api.homeLayout.saveDraft(toBody(doc, reg));
        setBase(fingerprint(doc, reg));
      }
      const r = await api.homeLayout.publish(note);
      setErrs(EMPTY_ERRORS);
      await refreshMeta();
      toast.success(r?.version ? `Published as version ${r.version}` : 'Published', { detail: 'Phones pick it up within about a minute.' });
      return true;
    } catch (e) {
      return report('Could not publish.', e, doc);
    } finally {
      setBusy('');
    }
  };

  /** Rollback, reset and discard all overwrite the DRAFT with a stored document (they never publish). */
  const overwrite = async (key, call, done) => {
    setBusy(key);
    try {
      const r = await call();
      const s = await refreshMeta();
      const draft = r?.draft?.layouts || r?.draft?.blocks ? r.draft : s?.draft;
      if (draft) adopt(draft, regRef.current);
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(`Could not do that. ${e.message}`);
      return false;
    } finally {
      setBusy('');
    }
  };
  const rollback = (version) => overwrite('rollback', () => api.homeLayout.rollback(version), `Version ${version} is now your draft. Publish it to make it live.`);
  const resetDefault = () => overwrite('reset', () => api.homeLayout.resetDefault(), 'Draft reset to the built-in default. Publish it to make it live.');
  const discard = () => overwrite('discard', () => api.homeLayout.discard(), 'Draft discarded. It matches the live layout again.');

  // Closing or reloading the browser tab asks first; switching dashboard tabs asks through the shell's unsaved guard.
  useUnsavedGuard(unsaved);
  useEffect(() => {
    const warn = (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return {
    load, reg, doc, layouts, active, fixed, meta, busy, unsaved, notes,
    errors: { entries: activeErrors, blocks: indexed.blocks, layouts: indexed.layouts, global: errs.global, count: activeErrors.length + errs.global.length },
    setActive: setActiveId,
    reload, patch, move, moveTo, remove, add, duplicate, replace,
    createLayout, updateLayout, duplicateLayout, deleteLayout, moveLayout: moveActive,
    save, validate, publish, discard, rollback, resetDefault,
  };
}
