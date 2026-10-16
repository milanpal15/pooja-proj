import { useRef, useState } from 'react';

import { dropIndex } from '../lib/layout.js';

/**
 * HTML5 drag-and-drop for an ordered list (sections, tiles). The row calls
 * `rowProps(index)` and spreads the result; `drag` says where the drop line
 * goes (`over` = row index, `after` = below it). ↑/↓ buttons stay as the
 * keyboard fallback, so nothing depends on dragging.
 *
 * @param {{ enabled: boolean, canDrop?: (index:number)=>boolean, onMove: (from:number, to:number)=>void }} o
 *   `onMove(from, to)`: `to` is the item's final index.
 */
export function useDragReorder({ enabled, canDrop = () => true, onMove }) {
  const from = useRef(null);
  const [drag, setDrag] = useState({ from: null, over: null, after: false });
  const reset = () => { from.current = null; setDrag({ from: null, over: null, after: false }); };

  const rowProps = (index, canDrag = true) => ({
    draggable: enabled && canDrag,
    onDragStart: (e) => {
      if (!enabled || !canDrag) { e.preventDefault(); return; }
      from.current = index;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(index)); } catch { /* some browsers refuse */ }
      setDrag({ from: index, over: null, after: false });
    },
    onDragOver: (e) => {
      if (from.current == null || !canDrop(index)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      setDrag((d) => (d.over === index && d.after === after ? d : { from: from.current, over: index, after }));
    },
    onDrop: (e) => {
      if (from.current == null || !canDrop(index)) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const to = dropIndex(from.current, index, e.clientY > r.top + r.height / 2);
      const f = from.current;
      reset();
      if (to !== f) onMove(f, to);
    },
    onDragEnd: reset,
  });

  return { drag, rowProps };
}
