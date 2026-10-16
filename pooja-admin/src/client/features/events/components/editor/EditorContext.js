import { createContext, useContext } from 'react';

/** What every editor section needs: the draft, how to change it, errors by path, lookups, and whether this account may write. */
export const EditorContext = createContext(null);
export const useEd = () => {
  const c = useContext(EditorContext);
  const ro = !!c?.ro;
  return { ...c, dis: ro ? { disabled: true } : {}, err: (p) => c?.errors?.[p] };
};
