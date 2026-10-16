import { chartModel } from '../lib/impact.js';

const ROW = 50;
const W = 480;
const BAR_W = W - 200;

/**
 * Devices per app build, as plain SVG bars. Length = installed devices; the right-hand text carries the count and the
 * share of devices active this week. The state ("Blocked build", "Below minimum", "Update nudge", "Supported") is written
 * beside each bar, so colour is never the only signal. A hidden table repeats the numbers for screen readers.
 */
export function VersionsChart({ byVersion, hyp, label = 'Devices by app build' }) {
  const { rows } = chartModel(byVersion, hyp);
  if (!rows.length) return null;
  const h = rows.length * ROW + 8;
  const max = Math.max(1, ...rows.map((r) => r.devices));
  return (
    <figure className="vchart">
      <svg viewBox={`0 0 ${W} ${h}`} width="100%" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${r.devices} devices, ${r.stateLabel}`).join('; ')}`} style={{ maxWidth: W }}>
        {rows.map((r, i) => {
          const y = i * ROW + 4;
          const w = Math.max(4, (r.devices / max) * BAR_W);
          return (
            <g key={r.code}>
              <text x="0" y={y + 13} className="vchart__label">
                {r.label}
              </text>
              <text x={W} y={y + 13} textAnchor="end" className={`vchart__state vchart__state--${r.state}`}>
                {r.state === 'ok' ? '' : r.stateLabel}
              </text>
              <path className={`vchart__bar vchart__bar--${r.state}`} d={`M0 ${y + 21} h${w - 4} a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 h-${w - 4} z`} />
              <text x={w + 8} y={y + 33} className="vchart__val">
                {r.devices.toLocaleString('en-IN')}
                <tspan className="vchart__pct"> · {r.pct} active 7d</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="vchart__legend" aria-label="Legend">
        <li><i className="vchart__sw vchart__bar--blocked" />Blocked or below the minimum</li>
        <li><i className="vchart__sw vchart__bar--nudged" />Gets an update nudge</li>
        <li><i className="vchart__sw vchart__bar--ok" />Supported</li>
      </ul>
      <table className="ui-sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Build</th><th>Devices</th><th>Active 7 days</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}><td>{r.label}</td><td>{r.devices}</td><td>{r.pct}</td><td>{r.stateLabel}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
