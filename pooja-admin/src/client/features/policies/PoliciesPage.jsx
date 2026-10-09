import { useAccess } from '../../lib/access/index.js';
import { Card, ErrorState } from '../../ui/index.js';
import { PolicyEditor } from './components/PolicyEditor.jsx';
import { PolicyToolbar } from './components/PolicyToolbar.jsx';
import { usePolicy } from './hooks/usePolicy.jsx';

/**
 * Rules & Regulations. Save and Publish are separate on purpose — see usePolicy.
 * Without `policies:edit` it is the published text and its preview, nothing to type into.
 */
export function PoliciesPage({ area = 'policies' }) {
  const p = usePolicy();
  const readOnly = !useAccess().canEdit(area);

  if (p.err) return <ErrorState message={p.err} onRetry={p.reload} />;
  if (!p.doc) return <p className="muted">Loading…</p>;

  return (
    <div className="ui-page">
      <Card flush>
        <PolicyToolbar doc={p.doc} dirty={p.dirty} note={p.note} busy={p.busy} readOnly={readOnly} onSave={p.save} />
        <div className="ui-card__body">
          <PolicyEditor title={p.title} onTitle={p.setTitle} body={p.body} onBody={p.setBody} readOnly={readOnly} />
        </div>
      </Card>
    </div>
  );
}
