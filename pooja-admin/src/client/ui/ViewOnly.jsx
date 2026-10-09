import { Button } from './Button.jsx';
import { Badge } from './Badge.jsx';
import { Modal } from './Modal.jsx';

/**
 * The shared read-only pattern (DESIGN.md §21.6). Without `edit`, a screen
 * does not render its actions; it renders these instead, so every feature
 * says "view only" the same way.
 */

/** Small header marker: this account can look, not change. */
export function ReadOnlyBadge() {
  return <Badge tone="outline">View only</Badge>;
}

/** A former switch/toggle as plain text. Real text, so it can be read and copied. */
export function StatusText({ on, onLabel = 'On', offLabel = 'Off' }) {
  return <span className={`ui-status-text ${on ? 'ui-status-text--on' : ''}`}>{on ? onLabel : offLabel}</span>;
}

/** Label/value pairs as text — the read-only stand-in for a form. */
export function ReadOnlyList({ rows, label }) {
  return (
    <dl className="ui-ro-list" aria-label={label}>
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value === '' || r.value == null ? '—' : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A details dialog with a "View only" note and a single Close button. */
export function ViewOnlyModal({ title, subtitle, lead, onClose, children }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      lead={lead}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }>
      <p className="ui-ro-note" role="note">
        View only. Your account can look at this but not change it.
      </p>
      {children}
    </Modal>
  );
}
