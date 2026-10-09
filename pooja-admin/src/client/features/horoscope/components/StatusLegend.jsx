export function StatusLegend({ counts }) {
  return (
    <div className="horo-legend">
      <span><i className="d pub" />Published {counts.pub}</span>
      <span><i className="d hidden" />Hidden {counts.hidden}</span>
      <span><i className="d empty" />Not published {counts.empty}</span>
    </div>
  );
}
