import { createContext, useContext } from 'react';

/** What every form piece needs: the registry, lookups, upload, whether this account may write, and errors by sub-path for the selected block. */
export const BuilderContext = createContext(null);
export const useBuilder = () => {
  const c = useContext(BuilderContext);
  const ro = !!c?.ro;
  return { ...c, dis: ro ? { disabled: true } : {}, err: (p) => c?.errors?.[p] };
};
