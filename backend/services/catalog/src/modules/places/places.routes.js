import { asyncRouter } from '../../lib/async-handler.js';
import { createPlacesService } from './places.service.js';

/** The caller the BFF forwards in the signed token's `ctx.ip` (the phone's address); a direct service caller is limited as itself. */
export const clientIdOf = (req) => String(req.auth?.ctx?.ip || req.auth?.iss || 'anonymous');

export function placesRouter(config, deps) {
  const svc = createPlacesService(config, deps);
  const r = asyncRouter();
  r.get('/places/temples', async (req, res) => {
    const body = await svc.temples(req.query, { clientId: clientIdOf(req) });
    res.set('Cache-Control', 'public, max-age=300');
    res.json(body);
  });
  return r;
}
