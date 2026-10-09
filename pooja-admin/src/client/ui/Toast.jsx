import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { FORBIDDEN_TEXT } from '../lib/access/forbidden.js';
import { IconButton } from './Button.jsx';

const ToastContext = createContext(null);
const MAX = 4;

/**
 * Transient feedback for something that already happened. Top-right, queued
 * (newest last, max 4), self-dismissing, announced to screen readers
 * (errors assertively). Never the only record of something important.
 *
 *   const toast = useToast();  toast.success('Saved'); toast.error(err.message);
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (tone, text, ms) => {
      // A refused action reports itself globally and again in the caller's own
      // "Could not save. …" toast: say it once, and never stack identical toasts.
      const said = text.includes(FORBIDDEN_TEXT) ? FORBIDDEN_TEXT : text;
      const id = nextId.current++;
      setItems((xs) => (xs.some((x) => x.text === said) ? xs : [...xs.slice(-(MAX - 1)), { id, tone, text: said }]));
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (text) => push('success', text, 4000),
      info: (text) => push('info', text, 4000),
      // A failure carries a reason worth reading: leave it up longer.
      error: (text) => push('error', text, 7000),
    }),
    [push],
  );

  const LABEL = { success: 'Done', error: 'Problem', info: 'Note' };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts">
        {items.map((t) => (
          <div
            key={t.id}
            className={`ui-toast ui-toast--${t.tone}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
            aria-live={t.tone === 'error' ? 'assertive' : 'polite'}>
            <div className="ui-toast__text">
              <b>{LABEL[t.tone]}</b>
              {t.text}
            </div>
            <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast needs <ToastProvider>');
  return ctx;
}
