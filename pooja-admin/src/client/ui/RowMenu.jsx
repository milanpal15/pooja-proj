import { useEffect, useId, useRef, useState } from 'react';

/**
 * The "⋯" overflow of a table row: the secondary actions (Duplicate, Delete)
 * behind one button, so a row keeps a single primary action visible.
 * Esc and a click outside close it; arrows move between items.
 *
 * @typedef {Object} RowMenuProps
 * @property {string} label    accessible name of the trigger ("More actions for X")
 * @property {Array<{label: string, onSelect: () => void, tone?: 'danger', disabled?: boolean}>} items
 */
export function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const root = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    // A table scrolls on its own, so the list is fixed to the viewport (right-aligned under the trigger) rather than clipped by it.
    const r = root.current.getBoundingClientRect();
    const below = r.bottom + 4 + items.length * 40 + 16 < window.innerHeight;
    setPos({ right: Math.max(8, window.innerWidth - r.right), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('mousedown', away);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (open && pos) root.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open, pos]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      setPos(null);
      root.current?.querySelector('button')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...root.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
      const at = all.indexOf(document.activeElement);
      all[(at + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
    }
  };

  return (
    <span className="ui-rowmenu" ref={root} onKeyDown={onKeyDown}>
      <button type="button" className="ui-iconbtn" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && pos && (
        <div id={menuId} role="menu" aria-label={label} className="ui-rowmenu__list" style={pos}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={`ui-rowmenu__item ${it.tone === 'danger' ? 'ui-rowmenu__item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
