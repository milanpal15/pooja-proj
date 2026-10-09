import { initials } from '../../../lib/ids.js';

/** Round initials chip (decorative; the name is always next to it). */
export function Avatar({ name, muted = false, large = false }) {
  return (
    <div className={`feat-avatar ${muted ? 'feat-avatar--muted' : ''} ${large ? 'feat-avatar--lg' : ''}`} aria-hidden="true">
      {initials(name)}
    </div>
  );
}
