import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useUnsavedGuard } from '../../../lib/hooks/useUnsavedGuard.js';
import { useToast } from '../../../ui/index.js';
import { activeEntries, bySubpath, mapErrors } from '../lib/errors.js';
import { blankBlock, duplicateBlock, fingerprint, idsOf, insertBlock, moveBlock, patchBlock, removeBlock, selectionAfterRemove, toBody, warnings } from '../lib/layout.js';
import { EMPTY_REGISTRY, normaliseRegistry } from '../lib/registry.js';

const EMPTY_ERRORS = { entries: [], global: [] };

/**
 * The Home layout draft and everything done to it: load, edit (add / move /
 * duplicate / remove / patch), validate, save, publish, roll back, reset.
 *
 * Nothing is autosaved. `unsaved` is "the working copy differs from the last
 * saved draft"; `differs` is the server's "the saved draft differs from the
 * live layout". A refused document comes back as `errors`: entries keyed by
 * block id (reorder-safe) plus `global` ones that belong to no block.
 */
export function useHomeLayout() {
  const toast = useToast();
  const [load, setLoad] = useState({ status: 'loading', error: '', offline: false });
  const [reg, setReg] = useState(EMPTY_REGISTRY);
  const [doc, setDoc] = useState({ schemaVersion: 1, blocks: [] });
  const [base, setBase] = useState('');
  const [meta, setMeta] = useState({ draft: null, published: null, history: [], dirty: false });
  const [errs, setErrs] = useState(EMPTY_ERRORS);
  const [busy, setBusy] = useState(''); // '' | 'save' | 'validate' | 'publish' | 'rollback' | 'reset'
  const removed = useRef(new Set()); // ids used and gone this session: an id is never reused
  const regRef = useRef(reg);
  regRef.current = reg;

  const adopt = useCallback((draft, registry) => {
    const d = { schemaVersion: draft?.schemaVersion || 1, blocks: Array.isArray(draft?.blocks) ? draft.blocks : [] };
    setDoc(d);
    setBase(fingerprint(d, registry));
    setErrs(EMPTY_ERRORS);
  }, []);

  const reload = useCallback(async () => {
    setLoad((l) => ({ ...l, status: l.status === 'ready' ? 'ready' : 'loading' }));
    try {
      const [state, raw] = await Promise.all([api.homeLayout.get(), api.homeLayout.registry()]);
      const registry = normaliseRegistry(raw);
      setReg(registry);
      setMeta({ draft: state.draft, published: state.published, history: state.history || [], dirty: !!state.dirty });
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
      setMeta({ draft: s.draft, published: s.published, history: s.history || [], dirty: !!s.dirty });
      return s;
    } catch {
      return null;
    }
  }, []);

  const unsaved = useMemo(() => load.status === 'ready' && fingerprint(doc, reg) !== base, [doc, reg, base, load.status]);
  const active = useMemo(() => activeEntries(errs.entries, doc.blocks), [errs, doc.blocks]);
  const errorsByBlock = useMemo(() => bySubpath(active), [active]);
  const notes = useMemo(() => warnings(doc), [doc]);

  /* ---- edits: all pure functions over blocks (lib/layout.js) ---- */
  const edit = (fn) => setDoc((d) => ({ ...d, blocks: fn(d.blocks) }));
  const patch = (id, p) => edit((bs) => patchBlock(bs, id, p));
  const move = (id, delta) => edit((bs) => moveBlock(bs, id, delta));
  const remove = (id) => {
    removed.current.add(id);
    edit((bs) => removeBlock(bs, id));
  };
  const add = (type, afterId) => {
    const block = blankBlock(type, regRef.current, [...idsOf(doc.blocks), ...removed.current]);
    edit((bs) => insertBlock(bs, block, afterId));
    return block.id;
  };
  const duplicate = (id) => {
    const r = duplicateBlock(doc.blocks, id, [...removed.current]);
    if (r.id) setDoc((d) => ({ ...d, blocks: r.blocks }));
    return r.id;
  };
  /** Replace the whole document (JSON tab → Apply). */
  const replace = (next) => {
    doc.blocks.forEach((b) => removed.current.add(b.id));
    setDoc({ schemaVersion: next.schemaVersion || 1, blocks: next.blocks });
  };

  /** Turn a refused response into mapped errors; true if it was one. */
  const refused = useCallback((e, blocks) => {
    if (e.code === 'bad_layout' || e.body?.fields) {
      const m = mapErrors(e.body?.fields, blocks);
      setErrs(m);
      return m.entries.length + m.global.length;
    }
    return 0;
  }, []);

  const report = (what, e, blocks) => {
    const n = refused(e, blocks);
    toast.error(n ? `The server refused the layout: ${n} ${n === 1 ? 'problem is' : 'problems are'} listed above.` : `${what} ${e.message}`);
    return false;
  };

  const save = async () => {
    setBusy('save');
    try {
      const body = toBody(doc, reg);
      await api.homeLayout.saveDraft(body);
      setBase(fingerprint(doc, reg));
      setErrs(EMPTY_ERRORS);
      await refreshMeta();
      toast.success('Draft saved');
      return true;
    } catch (e) {
      return report('Could not save the draft.', e, doc.blocks);
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
    const blocks = own ? doc.blocks : custom.blocks;
    setBusy('validate');
    try {
      await api.homeLayout.validate(body);
      if (own) setErrs(EMPTY_ERRORS);
      return { ok: true, entries: [], global: [] };
    } catch (e) {
      if (e.code === 'bad_layout' || e.body?.fields) {
        const m = mapErrors(e.body?.fields, blocks);
        if (own) setErrs(m);
        return { ok: false, ...m, message: e.message };
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
      return report('Could not publish.', e, doc.blocks);
    } finally {
      setBusy('');
    }
  };

  /** Rollback and reset both overwrite the DRAFT with a stored document (they never publish). */
  const overwrite = async (key, call, done) => {
    setBusy(key);
    try {
      const r = await call();
      const s = await refreshMeta();
      const draft = r?.draft?.blocks ? r.draft : s?.draft;
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

  // Closing or reloading the browser tab asks first; switching dashboard tabs asks through the shell's unsaved guard.
  useUnsavedGuard(unsaved);
  useEffect(() => {
    const warn = (e) => { if (unsaved) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return {
    load, reg, doc, meta, busy, unsaved, notes,
    errors: { active, byBlock: errorsByBlock, global: errs.global, count: active.length + errs.global.length },
    reload, edit, patch, move, remove, add, duplicate, replace, save, validate, publish, rollback, resetDefault,
  };
}
