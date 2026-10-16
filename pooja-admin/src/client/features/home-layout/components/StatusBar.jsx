import { Badge, Button, ReadOnlyBadge } from '../../../ui/index.js';
import { formatWhen } from '../../../lib/dates.js';

/** Draft state and the actions on it. Without edit rights only the state, History and a "View only" badge show. */
export function StatusBar({ canEdit, unsaved, differs, meta, busy, onSave, onPublish, onHistory, onReset }) {
  const live = meta.published;
  const state = unsaved ? { tone: 'warning', label: 'Unsaved changes' } : differs ? { tone: 'info', label: 'Saved draft, not live yet' } : { tone: 'success', label: 'Draft matches the live layout' };
  return (
    <div className="hl2-bar" role="region" aria-label="Draft status">
      <Badge tone={state.tone}>{state.label}</Badge>
      <span className="hl2-bar__info">
        {live ? `Live: version ${live.version}, ${live.blockCount ?? '?'} blocks${live.publishedAt ? `, ${formatWhen(live.publishedAt)}` : ''}${live.publishedBy ? ` by ${live.publishedBy}` : ''}` : 'Nothing published yet'}
        {meta.draft?.updatedAt ? ` · draft saved ${formatWhen(meta.draft.updatedAt)}${meta.draft.updatedBy ? ` by ${meta.draft.updatedBy}` : ''}` : ''}
      </span>
      <span className="hl2-bar__spacer" />
      <Button variant="outline" onClick={onHistory}>History</Button>
      {canEdit ? (
        <>
          <Button variant="outline" disabled={!!busy} onClick={onReset}>Reset to default</Button>
          <Button variant="secondary" loading={busy === 'save'} disabled={!unsaved || (!!busy && busy !== 'save')} onClick={onSave}>Save draft</Button>
          <Button loading={busy === 'publish'} disabled={(!!busy && busy !== 'publish') || (!unsaved && !differs)} onClick={onPublish}>Publish…</Button>
        </>
      ) : (
        <ReadOnlyBadge />
      )}
    </div>
  );
}
