import { Card } from '../../../ui/index.js';

export function TopScreens({ screens }) {
  return (
    <Card title="Top Screens">
      <ul className="list">
        {screens.map((s) => (
          <li key={s.screen}>
            <span>{s.screen}</span>
            <b>{s.count}</b>
          </li>
        ))}
        {screens.length === 0 && <li className="muted">No views yet</li>}
      </ul>
    </Card>
  );
}
