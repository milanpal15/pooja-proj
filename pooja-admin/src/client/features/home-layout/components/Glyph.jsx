/**
 * Small line icons for the builder: a section's type icon and a tile's icon.
 * Names are the registry's (the app's icon names, plus the few the design uses for section types).
 * Presentation only: an unknown name draws a plain ring, never nothing.
 */
const c = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const PATHS = {
  home: 'M4 11l8-7 8 7v9H4zM10 20v-5h4v5',
  temple: 'M5 21V11l7-6 7 6v10',
  diya: `M12 3c2 3 4 4.5 4 8a4 4 0 01-8 0c0-3.5 2-5 4-8zM4 20h16`,
  music: `M9 18V6l10-2v12${c(7, 18, 2.5)}`,
  person: `${c(12, 8, 4)}M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7`,
  user: `${c(12, 8, 4)}M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7`,
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  settings: `${c(12, 12, 3)}M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1`,
  search: `${c(11, 11, 7)}M16 16l5 5`,
  calendar: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  mapPin: `M12 21s-6-6-6-11a6 6 0 0112 0c0 5-6 11-6 11z${c(12, 10, 2)}`,
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.6-7 10-7 10z',
  share: `${c(6, 12, 2.5)}${c(18, 6, 2.5)}${c(18, 18, 2.5)}M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6`,
  nodes: `${c(6, 12, 2.5)}${c(18, 6, 2.5)}${c(18, 18, 2.5)}`,
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  globe: `${c(12, 12, 9)}M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18`,
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z',
  lotus: 'M12 20c-4 0-7-3-7-7 3 0 5 1 7 4 2-3 4-4 7-4 0 4-3 7-7 7zM12 17c-2-3-2-8 0-12 2 4 2 9 0 12z',
  marigold: `${c(12, 12, 3)}M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8`,
  shankh: 'M5 15c0-5 4-9 9-9 3 0 5 2 5 5s-3 7-8 7c-3 0-6-1-6-3z',
  gift: 'M4 9h16v4H4zM6 13v7h12v-7M12 9v11M12 9c-3 0-4-4-1-4 2 0 1 4 1 4zM12 9c3 0 4-4 1-4-2 0-1 4-1 4z',
  support: `M5 14v-2a7 7 0 0114 0v2M4 14h3v5H4zM17 14h3v5h-3z`,
  google: `${c(12, 12, 8)}M12 12h8`,
  bag: 'M5 7h14l-1 14H6zM9 7a3 3 0 016 0',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  clock: `${c(12, 12, 9)}M12 7v5l3 2`,
  moon: 'M20 14A8 8 0 019 3a8 8 0 1011 11z',
  /* section types in the design */
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  slider: 'M3 6h18v12H3z',
  monitor: 'M4 4h16v12H4zM8 20h8',
  circles: `${c(6, 12, 3)}${c(18, 12, 3)}`,
  circle: c(12, 12, 8),
  ribbon: `${c(12, 9, 6)}M8.5 14L7 22l5-3 5 3-1.5-8`,
  cards: 'M3 6h8v12H3zM13 6h8v12h-8z',
  bowl: 'M4 13h16l-2 7H6zM8 13c0-3 2-5 4-8 2 3 4 5 4 8',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3z',
  doc: 'M5 4h10l4 4v12H5z',
  panchang: 'M4 5h16v15H4zM4 10h16',
};

export function Glyph({ name, size = 16, className = '' }) {
  const d = PATHS[name] || PATHS.circle;
  return (
    <svg className={`hl3-glyph ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const hasGlyph = (name) => !!PATHS[name];
