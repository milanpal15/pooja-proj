/**
 * "Who sees this" as chips: Everyone, then one per audience segment from the registry.
 * Multi-select, ANY-of: a person matching any chosen segment sees it. "Everyone" clears the choice.
 * An audience this registry does not know (a newer layout) stays visible so it can be removed.
 */
export function AudienceChips({ value, audiences, onChange, disabled, label = 'Audience' }) {
  const chosen = Array.isArray(value) ? value : [];
  const known = audiences.map((a) => a.key);
  const unknown = chosen.filter((k) => !known.includes(k));
  const toggle = (k) => onChange(chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k]);
  const chip = (key, text, on, onClick, title) => (
    <button key={key} type="button" role="checkbox" aria-checked={on} className={`hl3-chip ${on ? 'hl3-chip--on' : ''}`} disabled={disabled} title={title} onClick={onClick}>{text}</button>
  );
  return (
    <div className="hl3-chips" role="group" aria-label={label}>
      {chip('everyone', 'Everyone', chosen.length === 0, () => onChange([]), 'Clears the choice: everyone sees it')}
      {audiences.map((a) => chip(a.key, a.label, chosen.includes(a.key), () => toggle(a.key), a.description))}
      {unknown.map((k) => chip(k, `${k} (unknown)`, true, () => toggle(k), 'This server does not know this audience; it matches nobody'))}
    </div>
  );
}
