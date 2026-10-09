import { ReadOnlyList, StatusText, ViewOnlyModal } from '../../../ui/index.js';
import { Avatar } from './Avatar.jsx';
import { PresenceBadge } from './PresenceBadge.jsx';
import { astrologerEarns } from '../lib/earnings-preview.js';

/**
 * One astrologer for an account that cannot edit: values as text. The sign-in
 * handle is shown exactly as the server sent it (masked for this role).
 */
export function AstrologerViewModal({ astrologer: a, onClose }) {
  const earns = astrologerEarns(a.ratePerMin, a.platformSharePct);
  return (
    <ViewOnlyModal title="Astrologer" subtitle={a.name} lead={<Avatar name={a.name} large />} onClose={onClose}>
      <ReadOnlyList
        label={`Details of ${a.name}`}
        rows={[
          { label: 'Display name', value: a.name },
          { label: 'Years of experience', value: a.yearsExperience },
          { label: 'Specialities', value: (a.specialities || []).join(', ') },
          { label: 'Languages', value: (a.languages || []).join(', ') },
          { label: 'About', value: a.bio },
          { label: 'Rate', value: a.ratePerMin != null ? `${a.ratePerMin} coins/min` : '' },
          { label: 'Platform share', value: a.platformSharePct != null ? `${a.platformSharePct}%` : '' },
          { label: 'Astrologer earns', value: earns === null ? '' : `${earns} coins/min` },
          { label: 'Sign-in', value: a.signInEmail || a.signInPhone },
          { label: 'Presence', value: <PresenceBadge astrologer={a} /> },
          { label: 'Account status', value: a.status },
          { label: 'Listed in the app', value: <StatusText on={a.listed !== false} onLabel="Listed" offLabel="Not listed" /> },
        ]}
      />
    </ViewOnlyModal>
  );
}
