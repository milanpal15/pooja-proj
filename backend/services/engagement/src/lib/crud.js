import mongoose from 'mongoose';

import { asyncRouter } from './async-handler.js';

/**
 * What an operator is told when a write fails (copied from the monolith's crud.factory.js): validation
 * messages pass through, a duplicate becomes a sentence, anything else is generic and logged.
 */
export function writeFailure(e) {
  if (e?.name === 'ValidationError') return { status: 400, error: e.message };
  if (e?.code === 11000) {
    const field = Object.keys(e.keyPattern ?? e.keyValue ?? {})[0];
    return { status: 409, error: field ? `Another item already uses that ${field}.` : 'That already exists.' };
  }
  if (e?.name === 'CastError') return { status: 400, error: `Invalid value for ${e.path ?? 'a field'}.` };
  console.error('x content write failed:', e?.message || e);
  return { status: 400, error: 'Could not save that.' };
}

/**
 * The same four routes (and answers) as the monolith's generic content CRUD, so the dashboard sees no change:
 * GET / (sorted), POST / (201), PUT /:id, DELETE /:id ({ok:true}).
 * `guards.write(req)` may throw an HttpError before any write.
 */
export function crud(name, Model, sort, { write = [], afterCreate } = {}) {
  const r = asyncRouter();
  const fail = (res, e) => {
    const { status, error } = writeFailure(e);
    res.status(status).json({ error });
  };
  r.get('/', async (_req, res) => res.json(await Model.find().sort(sort).lean()));
  r.post('/', ...write, async (req, res) => {
    try {
      const doc = await Model.create(req.body);
      afterCreate?.(doc);
      res.status(201).json(doc);
    } catch (e) {
      fail(res, e);
    }
  });
  r.put('/:id', ...write, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'That id is not valid.' });
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
      if (!doc) return res.status(404).json({ error: `${name} not found` });
      res.json(doc);
    } catch (e) {
      fail(res, e);
    }
  });
  r.delete('/:id', ...write, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'That id is not valid.' });
    await Model.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });
  return r;
}
