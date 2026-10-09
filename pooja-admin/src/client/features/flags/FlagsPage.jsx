import { useAccess } from '../../lib/access/index.js';
import { Card, ErrorNote, ReadOnlyBadge } from '../../ui/index.js';
import { FlagRow } from './components/FlagRow.jsx';
import { useFlags } from './hooks/useFlags.js';

export function FlagsPage({ area = 'flags' }) {
  const { data, err, busy, toggle } = useFlags();
  const readOnly = !useAccess().canEdit(area);

  if (err) return <ErrorNote msg={err} />;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="ui-page">
      <Card flush>
        <div className="ui-toolbar">
          <p className="ui-toolbar__note" style={{ margin: 0 }}>
            Toggles here control the live mobile app. Changes apply on the app's next launch or refresh.
          </p>
          {readOnly && <ReadOnlyBadge />}
        </div>
        {data.map((f) => (
          <FlagRow key={f.key} flag={f} busy={busy === f.key} readOnly={readOnly} onToggle={toggle} />
        ))}
      </Card>
    </div>
  );
}
