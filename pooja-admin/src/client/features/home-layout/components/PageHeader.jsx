import { Button, ReadOnlyBadge } from '../../../ui/index.js';
import { changesLabel } from '../lib/diff.js';

/**
 * The page header (the board): the sentence, the draft status dot, Version history, Discard and Publish to app.
 * `changes` is the server's count for the SAVED draft. Unsaved edits say so instead of guessing a number.
 */
export function PageHeader({ canEdit, unsaved, changes, busy, onSave, onPublish, onHistory, onDiscard }) {
  const status = unsaved ? 'Draft · unsaved edits' : changesLabel(changes);
  const dirty = unsaved || changes > 0;
  return (
    <div className="hl3-head" role="region" aria-label="Draft status">
      <p className="hl3-head__lede">Choose which sections the app’s Home shows, in what order, and to whom. Changes go live only when you publish.</p>
      <span className="hl3-status" role="status"><i className={`hl3-status__dot ${dirty ? 'hl3-status__dot--dirty' : 'hl3-status__dot--ok'}`} />{status}</span>
      <Button variant="outline" onClick={onHistory}>Version history</Button>
      {canEdit ? (
        <>
          {unsaved && <Button variant="secondary" loading={busy === 'save'} disabled={!!busy && busy !== 'save'} onClick={onSave}>Save draft</Button>}
          <Button variant="outline" loading={busy === 'discard'} disabled={!dirty || (!!busy && busy !== 'discard')} onClick={onDiscard}>Discard</Button>
          <Button loading={busy === 'publish'} disabled={!dirty || (!!busy && busy !== 'publish')} onClick={onPublish}>Publish to app</Button>
        </>
      ) : <ReadOnlyBadge />}
    </div>
  );
}
