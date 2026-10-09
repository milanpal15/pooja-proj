import { useState } from 'react';

import { idOf } from '../../../lib/ids.js';
import { isFixed } from '../lib/sources.js';
import { SectionRow } from './SectionRow.jsx';

/** The ordered list. Drag a row (mouse) or use its ↑ ↓ buttons (keyboard); both end in `onMove(from, to)`. */
export function SectionList({ sections, heroSlides, canEdit, onToggle, onEdit, onMove }) {
  const [from, setFrom] = useState(null);
  const [over, setOver] = useState(null);
  const end = () => {
    setFrom(null);
    setOver(null);
  };
  // Fixed blocks stay where they are; an editable shelf moves past other shelves only.
  const free = (i) => !isFixed(sections[i]);
  const prev = (i) => { for (let j = i - 1; j >= 0; j--) if (free(j)) return j + 1; return 0; };
  const next = (i) => { for (let j = i + 1; j < sections.length; j++) if (free(j)) return j + 1; return 0; };
  return (
    <ol className="hl-list" aria-label="Home blocks, in the order the phone shows them">
      {sections.map((s, i) => (
        <SectionRow
          key={idOf(s) ?? s.key}
          section={s}
          index={i}
          count={sections.length}
          canUp={prev(i)}
          canDown={next(i)}
          heroSlides={heroSlides}
          canEdit={canEdit}
          dragging={from === i}
          dropTarget={over === i && from !== null && from !== i && free(i)}
          onToggle={onToggle}
          onEdit={onEdit}
          onMove={onMove}
          dragProps={
            canEdit && !isFixed(s)
              ? {
                  onDragStart: (e) => {
                    setFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  },
                  onDragOver: (e) => {
                    if (from === null || !free(i)) return;
                    e.preventDefault();
                    setOver(i);
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    if (from !== null && free(i)) onMove(from, i);
                    end();
                  },
                  onDragEnd: end,
                }
              : {}
          }
        />
      ))}
    </ol>
  );
}
