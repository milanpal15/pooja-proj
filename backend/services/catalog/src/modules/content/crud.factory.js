import mongoose from 'mongoose';

import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * What an operator should be told when a write fails.
 *
 * Mongoose and MongoDB error strings describe the schema and the index
 * ("E11000 duplicate key error collection: … index: slug_1 dup key …"), which is
 * noise to an operator and a map for anyone else. A validation error already
 * names the field in plain words, so it passes through; a duplicate becomes a
 * sentence; anything else is a generic refusal and the detail goes to the log.
 */
export function writeFailure(e) {
  if (e?.name === 'ValidationError') return { status: 400, error: e.message };
  if (e?.code === 11000) {
    const field = Object.keys(e.keyPattern ?? e.keyValue ?? {})[0];
    return { status: 409, error: field ? `Another item already uses that ${field}.` : 'That already exists.' };
  }
  if (e?.name === 'CastError') return { status: 400, error: `Invalid value for ${e.path ?? 'a field'}.` };
  console.error('✗ content write failed:', e?.message || e);
  return { status: 400, error: 'Could not save that.' };
}

const badId = (res) => res.status(400).json({ error: 'That id is not valid.' });

/** A `prepare` refusal is the operator's mistake: say what is wrong, with its code. */
function refusal(e) {
  if (e instanceof HttpError) return { status: e.status, error: e.message, code: e.code };
  return writeFailure(e);
}

/**
 * Build a generic CRUD router for a Mongoose model.
 *
 * `prepare(body, existing)` is an optional hook run before every write. It
 * returns the body to store (cleaned, defaults filled) or throws an
 * `HttpError`; `existing` is the stored row on update, so a partial PUT can be
 * validated as the merged document.
 */
export function crud(ModelName, Model, sort = { order: 1, createdAt: 1 }, { prepare, view, routes } = {}) {
  const r = asyncRouter();
  // `view` shapes every row sent back (e.g. derives a field on read); stored data is untouched.
  const out = (doc) => (view ? view(doc?.toObject ? doc.toObject() : doc) : doc);
  r.get('/', async (_req, res) => {
    const rows = await Model.find().sort(sort).lean();
    res.json(view ? rows.map(view) : rows);
  });
  // Extra fixed-path routes (e.g. PUT /order) must register before the `/:id` ones.
  routes?.(r);
  r.post('/', async (req, res) => {
    try {
      const body = prepare ? await prepare(req.body, null) : req.body;
      res.status(201).json(out(await Model.create(body)));
    } catch (e) {
      const { status, error, code } = refusal(e);
      res.status(status).json({ error, ...(code ? { code } : {}) });
    }
  });
  r.put('/:id', async (req, res) => {
    // A malformed id is the caller's mistake (400), not a server fault (500).
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    try {
      let body = req.body;
      if (prepare) {
        const existing = await Model.findById(req.params.id).lean();
        if (!existing) return res.status(404).json({ error: `${ModelName} not found` });
        body = await prepare(req.body, existing);
      }
      const doc = await Model.findByIdAndUpdate(req.params.id, { $set: body }, { new: true });
      if (!doc) return res.status(404).json({ error: `${ModelName} not found` });
      res.json(out(doc));
    } catch (e) {
      const { status, error, code } = refusal(e);
      res.status(status).json({ error, ...(code ? { code } : {}) });
    }
  });
  r.delete('/:id', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    await Model.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });
  return r;
}
