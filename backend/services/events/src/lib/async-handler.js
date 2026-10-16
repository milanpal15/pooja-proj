import { Router } from 'express';

/** A Router whose async handlers forward rejections to the error handler (Express 4 does not). */
const METHODS = ['use', 'all', 'get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function wrap(handler) {
  if (typeof handler !== 'function' || handler.length >= 4 || handler.stack || handler.handle) return handler;
  return function wrapped(req, res, next) {
    try {
      const out = handler.call(this, req, res, next);
      if (out && typeof out.then === 'function') out.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

export function asyncRouter(options) {
  const router = Router(options);
  for (const m of METHODS) {
    const original = router[m].bind(router);
    router[m] = (...args) => original(...args.map((a) => (Array.isArray(a) ? a.map(wrap) : wrap(a))));
  }
  return router;
}
