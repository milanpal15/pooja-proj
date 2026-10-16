import { initialOf } from '../lib/format.js';

/** A round initial. The name may be masked ("Devotee ••4821"); whatever the API sent is what is drawn. */
export function Avatar({ user, size = 44 }) {
  return (
    <span className="usr-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {initialOf(user)}
    </span>
  );
}
