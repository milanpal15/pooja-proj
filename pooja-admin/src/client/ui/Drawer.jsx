import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './Button.jsx';
import { lockScroll, unlockScroll } from './scroll-lock.js';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A panel that slides in from the right over the page (a record's detail beside its list). Like Modal: focus moves in
 * and returns to what opened it, Tab is trapped, Esc / the scrim / ✕ call `onClose`, the page behind does not scroll.
 * Unlike Modal it may be opened over a list and may host Modals and ConfirmDialogs on top of it — key events that
 * come from those (they are portalled, but React bubbles them here) are ignored.
 *
 * @typedef {Object} DrawerProps
 * @property {boolean} open
 * @property {() => void} onClose
 * @property {string} title
 * @property {React.ReactNode} [lead]       left of the title (an avatar)
 * @property {React.ReactNode} [subtitle]
 * @property {React.ReactNode} [actions]    header actions under the title
 * @property {React.ReactNode} [header]     extra header content (tabs)
 * @property {'md'|'lg'} [size]
 */
export function Drawer({ open, onClose, title, subtitle, lead, actions, header, size = 'lg', children }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    lockScroll();
    panelRef.current?.focus();
    return () => {
      unlockScroll();
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (!panelRef.current?.contains(e.target)) return; // from a modal opened over the drawer
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="ui-drawer" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <aside ref={panelRef} className={`ui-drawer__panel ui-drawer__panel--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="ui-drawer__head">
          <div className="ui-drawer__top">
            {lead}
            <div className="ui-drawer__titles">
              <h2 id={titleId} className="ui-drawer__title">
                {title}
              </h2>
              {subtitle && <div className="ui-drawer__sub">{subtitle}</div>}
            </div>
            <IconButton label="Close" onClick={() => closeRef.current()}>
              ×
            </IconButton>
          </div>
          {actions && <div className="ui-drawer__actions">{actions}</div>}
          {header}
        </header>
        <div className="ui-drawer__body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
