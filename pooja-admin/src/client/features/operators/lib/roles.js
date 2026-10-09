/**
 * The roles an operator can hold (DESIGN.md §21.1). This is only the picker's
 * vocabulary — what each role may DO is decided by the server, which sends the
 * permission list with the session. Nothing else in the dashboard names a role.
 */
export const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Sees and edits everything, including operators and roles.' },
  { value: 'editor', label: 'Editor', desc: 'Edits content, horoscope, panchang and announcements. Everywhere else they can look but not touch.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only. Opens screens, changes nothing. No devotee accounts or operators.' },
];

export const roleLabel = (value) => ROLES.find((r) => r.value === value)?.label ?? value;
