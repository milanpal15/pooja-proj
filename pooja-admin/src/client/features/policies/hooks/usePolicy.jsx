import { useCallback, useEffect, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { useConfirm, useToast } from '../../../ui/index.js';

/**
 * The 'terms' policy document and its draft (title + Markdown body).
 *
 * Save and Publish are deliberately separate. Saving fixes a typo silently;
 * publishing bumps the version, which invalidates every prior acceptance and
 * makes every devotee read and accept again on next launch — so it asks first.
 */
export function usePolicy() {
  const confirm = useConfirm();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.policy('terms');
      setDoc(d);
      setBody(d.bodyMd || '');
      setTitle(d.title || '');
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (publish) => {
    if (publish) {
      const ok = await confirm({
        title: 'Publish new version',
        message: (
          <>
            {'Publishing bumps the version to ' + ((doc?.version ?? 0) + 1) + '.'}
            <br />
            <br />
            Every devotee will be asked to read and accept the rules again on their next launch. Continue?
          </>
        ),
        confirmLabel: 'Publish',
      });
      if (!ok) return;
    }
    setBusy(publish ? 'publish' : 'save');
    setNote('');
    try {
      const updated = await api.savePolicy('terms', { title, bodyMd: body }, publish);
      setDoc(updated);
      setNote(publish ? `Published as v${updated.version}` : 'Saved (version unchanged)');
    } catch (e) {
      // The draft stays on screen; only a failed LOAD replaces the page.
      toast.error(`Could not save. ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const dirty = !!doc && (body !== (doc.bodyMd || '') || title !== (doc.title || ''));

  return { doc, reload: load, title, setTitle, body, setBody, busy, note, err, dirty, save };
}
