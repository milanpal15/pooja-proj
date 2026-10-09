/** A short choice as joined buttons (radio semantics): slide type, layout. */
export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="ui-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="ui-seg__opt" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
