import { Button, StatusText, Switch } from '../../../ui/index.js';
import { Avatar } from './Avatar.jsx';
import { PresenceBadge } from './PresenceBadge.jsx';

/** One astrologer. Listed toggles in place; everything else is in Edit. */
export function AstrologerRow({ astrologer: a, readOnly = false, onEdit, onListed }) {
  const meta = [(a.languages || []).join(', '), a.yearsExperience ? `${a.yearsExperience} yrs` : 'new'].filter(Boolean).join(' · ');
  return (
    <tr>
      <td>
        <div className="feat-person">
          <Avatar name={a.name} muted={a.status !== 'active'} />
          <div>
            <b>{a.name}</b>
            <span className="sub">{meta}</span>
          </div>
        </div>
      </td>
      <td>{(a.specialities || []).join(', ') || '—'}</td>
      <td>
        <b>{a.ratePerMin}</b> coins/min
      </td>
      <td>{a.platformSharePct}%</td>
      <td>
        <PresenceBadge astrologer={a} />
      </td>
      <td className="num">{a.calls30d ?? '—'}</td>
      <td>
        {readOnly ? (
          <StatusText on={!!a.listed} onLabel="Listed" offLabel="Not listed" />
        ) : (
          <Switch label={`Listed in the app: ${a.name}`} checked={!!a.listed} onChange={(v) => onListed(a, v)} />
        )}
      </td>
      <td className="actions">
        <Button variant="outline" size="sm" onClick={() => onEdit(a)} aria-label={`${readOnly ? 'View' : 'Edit'} ${a.name}`}>
          {readOnly ? 'View' : 'Edit'}
        </Button>
      </td>
    </tr>
  );
}
