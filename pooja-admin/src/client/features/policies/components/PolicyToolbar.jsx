import { Badge, Button, ReadOnlyBadge } from '../../../ui/index.js';

/** Version line, unsaved/saved notes, and the Save draft / Publish buttons (a "View only" badge instead, read-only). */
export function PolicyToolbar({ doc, dirty, note, busy, readOnly = false, onSave }) {
  return (
    <div className="ui-toolbar">
      <div className="ui-toolbar__right">
        <span className="ui-toolbar__note">
          Version <b>{doc.version}</b>
          {doc.publishedAt && ` · published ${new Date(doc.publishedAt).toLocaleDateString()}`}
        </span>
        {dirty && <Badge tone="danger">unsaved</Badge>}
        {note && <Badge tone="success">{note}</Badge>}
      </div>
      {readOnly ? (
        <ReadOnlyBadge />
      ) : (
        <div className="ui-toolbar__right">
          <Button variant="secondary" disabled={!!busy || !dirty} loading={busy === 'save'} onClick={() => onSave(false)}>
            {busy === 'save' ? 'Saving…' : 'Save draft'}
          </Button>
          <Button loading={busy === 'publish'} disabled={!!busy} onClick={() => onSave(true)}>
            {busy === 'publish' ? 'Publishing…' : 'Publish new version'}
          </Button>
        </div>
      )}
    </div>
  );
}
