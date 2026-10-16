import { Card, IconButton, Switch } from '../../../../ui/index.js';
import { BLOCKS } from '../../lib/events.js';
import { useEd } from './EditorContext.js';

/**
 * The sections an event has. Switching one on shows its form; the app shows
 * only the sections that are on, in this order. A switched-off section keeps
 * what was typed in it for this session but is not saved.
 */
export function BlocksCard() {
  const { d, set, ro, dis } = useEd();
  const on = d.blocks;
  const toggle = (id, next) => set({ blocks: next ? BLOCKS.map((b) => b.id).filter((x) => x === id || on.includes(x)) : on.filter((x) => x !== id) });
  const move = (id, dir) => {
    const i = on.indexOf(id);
    const next = on.slice();
    next.splice(i + dir, 0, next.splice(i, 1)[0]);
    set({ blocks: next });
  };
  const ordered = [...on.filter((x) => BLOCKS.some((b) => b.id === x)), ...BLOCKS.map((b) => b.id).filter((x) => !on.includes(x))];
  return (
    <Card title="Sections" description="Choose what this event has. The app shows them in this order.">
      <ul className="ev-blocks" aria-label="Event sections">
        {ordered.map((id) => {
          const b = BLOCKS.find((x) => x.id === id);
          const i = on.indexOf(id);
          return (
            <li key={id} className="ev-block">
              <Switch variant="card" label={b.label} hint={b.hint} checked={i >= 0} onChange={(v) => toggle(id, v)} {...dis} />
              {i >= 0 && !ro && (
                <span className="ev-block__move">
                  <IconButton label={`Move ${b.label} up`} disabled={i === 0} onClick={() => move(id, -1)}>↑</IconButton>
                  <IconButton label={`Move ${b.label} down`} disabled={i === on.length - 1} onClick={() => move(id, 1)}>↓</IconButton>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
