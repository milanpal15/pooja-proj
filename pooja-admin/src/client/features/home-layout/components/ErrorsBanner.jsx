import { Banner, Button } from '../../../ui/index.js';
import { describeEntry } from '../lib/errors.js';

/** The server's refusals, each pointing at its block and field; clicking one selects that block. */
export function ErrorsBanner({ entries, global, blocks, onSelect }) {
  const total = entries.length + global.length;
  if (!total) return null;
  return (
    <Banner tone="error">
      The server refused this layout: {total} {total === 1 ? 'problem needs' : 'problems need'} fixing.
      <ul className="hl2-errors">
        {global.map((g) => <li key={g.path}><b>{g.path.replace(/\./g, ' › ')}</b>: {g.message}</li>)}
        {entries.slice(0, 12).map((e) => (
          <li key={e.path}>
            <Button variant="ghost" size="sm" onClick={() => onSelect(e.blockId)}>{describeEntry(e, blocks)}</Button>: {e.message}
          </li>
        ))}
        {entries.length > 12 && <li>…and {entries.length - 12} more</li>}
      </ul>
    </Banner>
  );
}
