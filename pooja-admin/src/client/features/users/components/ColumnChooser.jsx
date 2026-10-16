import { useEffect, useRef } from 'react';

import { COLUMNS } from '../lib/views.js';

/** "Columns" disclosure with a checkbox per column. Name is always on. Closes on Esc or a click elsewhere. */
export function ColumnChooser({ value, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => {
      if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const on = new Set(value);
  const toggle = (id) => onChange(on.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <details
      className="usr-pop"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && ref.current?.open) {
          e.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}>
      <summary className="usr-pop__trigger">Columns</summary>
      <div className="usr-pop__panel" role="group" aria-label="Choose columns">
        {COLUMNS.map((c) => (
          <label key={c.id} className="usr-check">
            <input type="checkbox" checked={c.locked || on.has(c.id)} disabled={c.locked} onChange={() => toggle(c.id)} />
            {c.label}
          </label>
        ))}
      </div>
    </details>
  );
}
