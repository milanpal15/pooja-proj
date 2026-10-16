import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveRoute } from '../nav/route.js';
import { hasUnsavedWork } from './useUnsavedGuard.js';

const pathOf = (hash) => String(hash || '').replace(/^#/, '').split('?')[0].toLowerCase();

/**
 * The shell's router: mirrors `location.hash` into a resolved route (lib/nav/route.js).
 *  - an old `#Users` link is rewritten in place to `#/people/users` (no extra history entry);
 *  - leaving a page that has unsaved work (useUnsavedGuard) asks first, whichever way the hash changed
 *    (sidebar, palette, a link inside a page, the browser's back button). If declined the old hash is restored;
 *  - `navigate('#/admin/roles/x')` just sets the hash, so the same guard covers it.
 *
 * @param {(opts) => Promise<boolean>} confirm  the kit's useConfirm()
 */
export function useRoute(modules, groups, confirm) {
  const [hash, setHash] = useState(() => window.location.hash);
  const committed = useRef(window.location.hash);
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  const commit = useCallback(
    (raw) => {
      const r = resolveRoute(raw, modules, groups);
      let next = raw;
      if (r.kind === 'module' && (r.legacy || (raw !== r.canonical && pathOf(raw) !== pathOf(r.canonical)))) {
        next = r.canonical;
        window.history.replaceState(null, '', next);
      }
      committed.current = next;
      setHash(next);
    },
    [modules, groups],
  );

  useEffect(() => {
    commit(window.location.hash);
    let asking = false;
    const onHash = async () => {
      const raw = window.location.hash;
      if (raw === committed.current) return;
      if (pathOf(raw) !== pathOf(committed.current) && hasUnsavedWork()) {
        if (asking) return;
        asking = true;
        const back = committed.current;
        // Put the address bar back while we ask, so declining leaves nothing to undo.
        window.history.replaceState(null, '', back || '#');
        const ok = await confirmRef.current({
          title: 'Leave without saving?',
          message: 'This page has changes that are not saved. If you leave now they will be lost.',
          confirmLabel: 'Leave and discard',
          cancelLabel: 'Stay here',
          tone: 'danger',
        });
        asking = false;
        if (!ok) return;
        window.history.replaceState(null, '', raw);
      }
      commit(raw);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [commit]);

  const route = useMemo(() => resolveRoute(hash, modules, groups), [hash, modules, groups]);
  const navigate = useCallback((target) => {
    if (window.location.hash === target) return;
    window.location.hash = target;
  }, []);
  /** Replace the current entry (redirects). */
  const replace = useCallback(
    (target) => {
      window.history.replaceState(null, '', target);
      commit(target);
    },
    [commit],
  );
  return { route, navigate, replace };
}
