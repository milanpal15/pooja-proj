/**
 * The one-line description under a section's name in the list (docs/HOME_LAYOUT.md §9.3: a `summary` template per type).
 * A template is plain text with `{token}` holes, e.g. "{count} shortcuts · {columns} per row":
 *   {count}   inline items that are switched on        {items}  all inline items
 *   {titles}  the first five item titles, comma-joined  {source} the bound source's title
 *   {limit}   the source's limit                        {title}  the block's own title
 *   {<prop>}  any key of the block's props (columns, layout, height …)
 * A part (split on " · ") whose tokens are all empty is dropped, so "Auto · max {limit}" never reads "Auto · max".
 * A type with no template falls back to what the data says.
 */
const first = (items, n) => items.slice(0, n);

function tokens(block, reg) {
  const items = block.data?.mode === 'inline' ? block.data.items || [] : [];
  const live = items.filter((i) => i.enabled !== false);
  const src = block.data?.mode === 'source' ? reg?.sourceMap?.[block.data.source] : null;
  return {
    ...(block.props || {}),
    count: items.length ? String(live.length) : '',
    items: items.length ? String(items.length) : '',
    titles: first(live.map((i) => i.title || i.titleHi).filter(Boolean), 5).join(', '),
    source: block.data?.mode === 'source' ? src?.title || block.data.source || '' : '',
    limit: block.data?.mode === 'source' && block.data.limit ? String(block.data.limit) : '',
    title: block.title || '',
  };
}

export function fillTemplate(template, vals) {
  return String(template)
    .split(' · ')
    .map((part) => {
      const holes = [...part.matchAll(/\{([\w.]+)\}/g)];
      if (holes.length && holes.every((h) => !vals[h[1]])) return '';
      return part.replace(/\{([\w.]+)\}/g, (_, k) => vals[k] ?? '');
    })
    .filter((p) => p.trim())
    .join(' · ');
}

/** What the data says, with no template: "Upcoming poojas · max 6", "5 cards", "". */
export function dataLine(block, reg) {
  const d = block.data;
  if (!d) return '';
  if (d.mode === 'source') {
    const t = reg?.sourceMap?.[d.source]?.title || d.source || 'no source chosen';
    return d.limit ? `${t} · max ${d.limit}` : t;
  }
  const n = (d.items || []).length;
  return `${n} ${n === 1 ? 'card' : 'cards'}`;
}

export function summaryLine(block, reg) {
  const type = reg?.typeMap?.[block.type];
  if (!type) return 'Unknown section type';
  const line = type.summary ? fillTemplate(type.summary, tokens(block, reg)) : '';
  return line || dataLine(block, reg) || type.description || '';
}
