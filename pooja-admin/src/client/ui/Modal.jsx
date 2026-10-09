import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from './Button.jsx';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openCount = 0;

/**
 * A dialog. Focus moves in on open and returns to whatever opened it; Tab is
 * trapped inside; Esc, a click on the scrim and the ✕ all call `onClose`.
 * The parent decides what closing means (e.g. confirm discarding a dirty form).
 * A modal never opens another modal — use ConfirmDialog.
 *
 * @typedef {Object} ModalProps
 * @property {boolean} open
 * @property {() => void} onClose
 * @property {string} title
 * @property {string} [subtitle]
 * @property {React.ReactNode} [lead]      left of the title (an avatar)
 * @property {React.ReactNode} [footer]    main actions, right-aligned
 * @property {React.ReactNode} [footerExtra]  destructive actions, far left
 * @property {'md'|'sm'|'lg'|'xl'} [size]
 * @property {boolean} [top]               stack above another modal (ConfirmDialog)
 * @property {boolean} [dismissible=true]  false while saving
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  lead,
  footer,
  footerExtra,
  size = 'md',
  top = false,
  dismissible = true,
  children,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const trigger = document.activeElement;
    openCount += 1;
    document.body.style.overflow = 'hidden';
    // First field if there is one, else the dialog itself (never the ✕, which
    // would make Enter close it).
    const dialog = dialogRef.current;
    const first = dialog?.querySelector('.ui-modal__body input, .ui-modal__body select, .ui-modal__body textarea, .ui-modal__body button, .ui-modal__foot button');
    (first || dialog)?.focus();
    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = '';
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (dismissible) closeRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  return createPortal(
    <div
      className={`ui-modal ${top ? 'ui-modal--top' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}>
      <div
        ref={dialogRef}
        className={`ui-modal__dialog ui-modal__dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}>
        <header className="ui-modal__head">
          {lead}
          <div className="ui-modal__titles">
            <h2 id={titleId} className="ui-modal__title">
              {title}
            </h2>
            {subtitle && <p className="ui-modal__sub">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} disabled={!dismissible}>
            ×
          </IconButton>
        </header>
        <div className="ui-modal__body">{children}</div>
        {(footer || footerExtra) && (
          <footer className="ui-modal__foot">
            <div className="ui-modal__foot-extra">{footerExtra}</div>
            <div className="ui-modal__foot-main">{footer}</div>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
