import { StatusText, Switch } from '../../../ui/index.js';

/** One feature flag: its name and description, and the switch (text, read-only). */
export function FlagRow({ flag, busy, readOnly = false, onToggle }) {
  const name = flag.label || flag.key;
  return (
    <div className="flag">
      <div>
        <div className="flag-label">{name}</div>
        <div className="flag-desc">{flag.desc}</div>
      </div>
      {readOnly ? (
        <StatusText on={!!flag.enabled} />
      ) : (
        <Switch label={name} checked={!!flag.enabled} disabled={busy} onChange={(next) => onToggle(flag.key, next)} />
      )}
    </div>
  );
}
