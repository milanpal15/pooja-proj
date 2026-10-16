import { Badge } from '../../../../ui/index.js';
import { api } from '../../../../lib/api/index.js';
import { formatDateTime, formatWhen } from '../../../../lib/dates.js';
import { isBlocked, methodLabel, roleLabel } from '../../lib/format.js';
import { TagChips } from '../TagChips.jsx';

const Row = ({ label, children }) => (
  <div className="usr-kv__row">
    <dt>{label}</dt>
    <dd>{children === '' || children == null ? '—' : children}</dd>
  </div>
);

/** Identity fields exactly as the API returned them (masked for roles without devotees:view). */
export function ProfileTab({ detail }) {
  const u = detail.user;
  const block = u.block;
  return (
    <div className="usr-profile">
      {u.photoUrl && <img className="usr-photo" src={api.asset(u.photoUrl)} alt="" width={72} height={72} />}
      <dl className="usr-kv">
        <Row label="Name">{u.name}</Row>
        <Row label="Contact">{u.contact}</Row>
        <Row label="E-mail">
          {u.email ? (
            <>
              {u.email} {u.emailVerified != null && <Badge tone={u.emailVerified ? 'success' : 'neutral'}>{u.emailVerified ? 'Verified' : 'Not verified'}</Badge>}
            </>
          ) : null}
        </Row>
        <Row label="Sign-in">{methodLabel(u.method)}</Row>
        <Row label="Role">{roleLabel(u.role)}</Row>
        <Row label="Date of birth">{u.dob}</Row>
        <Row label="Gender">{u.gender}</Row>
        <Row label="Saved temples">{u.savedTemples}</Row>
        <Row label="Tags"><TagChips tags={u.tags} max={10} /></Row>
        <Row label="Created">{formatDateTime(u.createdAt)}</Row>
        <Row label="Last active">{formatWhen(u.lastActive)}</Row>
        <Row label="User id"><code className="usr-code">{u.uid ?? u.id}</code></Row>
        <Row label="Policies accepted">
          {(u.acceptedPolicies ?? []).length ? (
            <ul className="usr-plain">
              {u.acceptedPolicies.map((p, i) => (
                <li key={p.key ?? i}>
                  {p.key ?? p.name ?? 'Policy'}{p.version != null ? ` v${p.version}` : ''}{p.at ? ` · ${formatWhen(p.at)}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </Row>
      </dl>
      {isBlocked(u) && block && (
        <section className="usr-blockcard" aria-label="Current block">
          <h3>Current block</h3>
          <dl className="usr-kv">
            <Row label="Reason (operators only)">{block.reason}</Row>
            <Row label="Message shown">{block.message}</Row>
            <Row label="Message (Hindi)">{block.messageHi}</Row>
            <Row label="Ends">{block.until ? formatDateTime(block.until) : 'When unblocked'}</Row>
            <Row label="Blocked by">{[block.by, block.at && formatWhen(block.at)].filter(Boolean).join(' · ')}</Row>
          </dl>
        </section>
      )}
    </div>
  );
}
