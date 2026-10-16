import { useEffect } from 'react';

let current = null;

/**
 * A page with work that is not saved yet calls `useUnsavedGuard(true)`; the shell then asks before the
 * operator moves to another dashboard tab (the browser's own prompt only covers closing or reloading).
 */
export function useUnsavedGuard(unsaved) {
  useEffect(() => {
    if (!unsaved) return undefined;
    const token = {};
    current = token;
    return () => {
      if (current === token) current = null;
    };
  }, [unsaved]);
}

export const hasUnsavedWork = () => current !== null;
