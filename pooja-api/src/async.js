import { Router } from 'express';

/**
 * A Router whose async handlers cannot take the process down with them.
 *
 * Express 4 does not forward a rejected promise to the error handler — an
 * `async (req, res) => …` that throws becomes an unhandled rejection, and
 * Node's default for that is to exit. So one failed write, for one devotee,
 * stops the API answering anyone. That is exactly what happened: a single
 * `VersionError` inside `/auth/sync` killed the server.
 *
 * Wrapping at the Router rather than at each of the three dozen handlers
 * means a route added later is covered without anyone remembering to.
 */

const METHODS = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function wrap(handler) {
  if (typeof handler !== 'function') return handler;
  // Error-handling middleware takes four arguments; wrapping one would hide
  // it from Express, which picks them out by arity.
  if (handler.length >= 4) return handler;
  // A mounted Router or app is middleware too, but it brings its own
  // plumbing and must be passed through untouched.
  if (handler.stack || handler.handle) return handler;

  return function wrapped(req, res, next) {
    try {
      const out = handler.call(this, req, res, next);
      if (out && typeof out.then === 'function') out.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

const wrapAll = (arg) => (Array.isArray(arg) ? arg.map(wrap) : wrap(arg));

export function asyncRouter(options) {
  const router = Router(options);
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrapAll));
  }
  return router;
}
