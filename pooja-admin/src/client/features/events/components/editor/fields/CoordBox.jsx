import { useEffect, useRef, useState } from 'react';

import { Field } from '../../../../../ui/index.js';
import { formatCoords, parseCoords } from '../../../../../lib/geo.js';

/**
 * One box for a place as "lat, lng". Paste what any maps app copies
 * ("19.0760, 72.8777") and it applies at once; typing something unreadable
 * says so and keeps the last good value. The map is never the only way in.
 */
export function CoordBox({ label, lat, lng, onCommit, error, hint, hideLabel, disabled, placeholder = '19.0760, 72.8777' }) {
  const shown = formatCoords(Number(lat), Number(lng));
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setText(shown); setBad(false); } }, [shown]);
  const change = (v) => {
    setText(v);
    const p = parseCoords(v);
    setBad(!!v.trim() && !p);
    if (p) onCommit({ lat: p.lat, lng: p.lng });
  };
  return (
    <Field label={label} hideLabel={hideLabel} value={text} placeholder={placeholder} disabled={disabled} hint={hint} inputMode="decimal" autoComplete="off" spellCheck={false}
      error={bad ? 'Could not read that. Use latitude, longitude, like 19.0760, 72.8777' : error}
      onChange={change} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(shown); setBad(false); }} />
  );
}
