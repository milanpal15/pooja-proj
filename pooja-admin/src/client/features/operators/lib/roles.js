/**
 * The roles an operator can hold (DESIGN.md §21.1). This is only the picker's
 * vocabulary — what each role may DO is decided by the server, which sends the
 * permission list with the session. Nothing else in the dashboard names a role.
 */
export const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Everything: edits every screen, including devotees, operators, roles and push.' },
  { value: 'editor', label: 'Editor', desc: 'Edits content, horoscope, panchang, announcements and events. Views everything else except devotees, operators and push, which they cannot open.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only. Opens every screen except devotees, operators and push, and changes nothing.' },
];

export const roleLabel = (value) => ROLES.find((r) => r.value === value)?.label ?? value;
