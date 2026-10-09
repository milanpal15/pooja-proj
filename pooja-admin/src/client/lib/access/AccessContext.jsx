import { createContext, useContext, useMemo } from 'react';

import { makeAccess } from './permissions.js';

const AccessContext = createContext(makeAccess(null));

/** Provides `useAccess()` from the session the server returned. */
export function AccessProvider({ session, children }) {
  const access = useMemo(() => makeAccess(session), [session]);
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

/** @returns {{ role, can(perm), canView(area), canEdit(area) }} */
export const useAccess = () => useContext(AccessContext);

/**
 * Inline gating: `<Can edit="money">…</Can>`, `<Can view="wallets" fallback={…}>`,
 * or `<Can perm="push:edit">`. With several props, all must hold.
 */
export function Can({ edit, view, perm, fallback = null, children }) {
  const a = useAccess();
  const ok = (!edit || a.canEdit(edit)) && (!view || a.canView(view)) && (!perm || a.can(perm));
  return ok ? children : fallback;
}
