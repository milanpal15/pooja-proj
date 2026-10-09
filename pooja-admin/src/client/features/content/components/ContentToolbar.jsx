import { Button, ReadOnlyBadge } from '../../../ui/index.js';

export function ContentToolbar({ count, scopeNote, title, onAdd, readOnly = false }) {
  return (
    <div className="ui-toolbar">
      <span className="ui-toolbar__note">
        {count} {count === 1 ? 'item' : 'items'}
        {scopeNote ? ` · ${scopeNote}` : ''}
      </span>
      {readOnly ? <ReadOnlyBadge /> : <Button onClick={onAdd}>+ Add {title}</Button>}
    </div>
  );
}
