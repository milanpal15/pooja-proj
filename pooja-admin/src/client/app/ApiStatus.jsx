import { api } from '../lib/api/index.js';

/** "API connected / offline" and where the dashboard thinks the API is. */
export function ApiStatus({ online }) {
  return (
    <div className={online ? 'status ok' : 'status bad'}>
      <span className="dot" /> {online ? 'API connected' : 'API offline'}
      <div className="api-base">{api.base}</div>
    </div>
  );
}
