import { useEffect, useState } from 'react';

/** The current tab, mirrored to `#hash` so a tab is bookmarkable. */
export function useHashRoute(fallback) {
  const [tab, setTabState] = useState(() => decodeURIComponent(location.hash.slice(1)) || fallback);
  // A link inside a page (e.g. Home layout -> Festivals) only sets the hash.
  useEffect(() => {
    const onHash = () => setTabState(decodeURIComponent(location.hash.slice(1)) || fallback);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fallback]);
  const setTab = (t) => {
    setTabState(t);
    location.hash = encodeURIComponent(t);
  };
  return [tab, setTab];
}
