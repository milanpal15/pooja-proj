import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { FORBIDDEN_TEXT } from '../lib/access/forbidden.js';
import { IconButton } from './Button.jsx';

const ToastContext = createContext(null);
const MAX = 4;
/** How long each tone stays up. A failure carries a reason worth reading, so it stays longest. */
export const TOAST_MS = { success: 6000, info: 6000, error: 10000 };
const LABEL = { success: 'Done', error: 'Problem', info: 'Note' };

/**
 * Transient feedback for something that already happened. Top-right, queued
 * (newest last, max 4), self-dismissing, announced to screen readers
 * (errors assertively). The timer pauses while the toast is hovered or
 * focused. Never the only record of something important.
 *
 *   const toast = useToast();
 *   toast.success('Saved');
 *   toast.success('Published as version 12', { detail: 'Phones pick it up within about a minute.' });
 *   toast.error(err.message);
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback((tone, text, opts) => {
    // A refused action reports itself globally and again in the caller's own
    // "Could not save. …" toast: say it once, and never stack identical toasts.
    const said = String(text ?? '').includes(FORBIDDEN_TEXT) ? FORBIDDEN_TEXT : String(text ?? '');
    const detail = opts && typeof opts.detail === 'string' && opts.detail ? opts.detail : '';
    const id = nextId.current++;
    setItems((xs) =>
      xs.some((x) => x.text === said && x.detail === detail) ? xs : [...xs.slice(-(MAX - 1)), { id, tone, text: said, detail }],
    );
  }, []);

  const api = useMemo(
    () => ({
      success: (text, opts) => push('success', text, opts),
      info: (text, opts) => push('info', text, opts),
      error: (text, opts) => push('error', text, opts),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts">
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** One toast with its own timer, which waits while the pointer or keyboard focus is on it. */
function ToastItem({ toast: t, onDismiss }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => onDismiss(t.id), TOAST_MS[t.tone]);
    return () => clearTimeout(timer);
  }, [paused, t.id, t.tone, onDismiss]);

  return (
    <div
      className={`ui-toast ui-toast--${t.tone}`}
      role={t.tone === 'error' ? 'alert' : 'status'}
      aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}>
      <div className="ui-toast__text">
        <b>{LABEL[t.tone]}</b>
        {t.text}
        {!!t.detail && <span className="ui-toast__detail">{t.detail}</span>}
      </div>
      <IconButton label="Dismiss" className="ui-toast__close" onClick={() => onDismiss(t.id)}>
        ×
      </IconButton>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast needs <ToastProvider>');
  return ctx;
}
