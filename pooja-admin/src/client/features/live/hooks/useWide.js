import { useEffect, useState } from 'react';

/** True at 1240px and up (the sidebar takes 240 of that): the editor is a side panel there, a modal below. */
export function useWide(min = 1240) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => (typeof matchMedia === 'function' ? matchMedia(q).matches : true));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}
