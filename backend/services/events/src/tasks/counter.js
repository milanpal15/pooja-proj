import { bilingual, pick, reader } from './kit.js';

/** At most one accepted `add` per this many milliseconds per (devotee, task): a held-down button cannot fabricate a count. */
export const MIN_ADD_INTERVAL_MS = 400;
/** One report may add at most this many (the app batches taps and flushes). */
export const MAX_ADD = 200;

export default {
  kind: 'counter',
  title: 'Counter (chant, rounds)',
  interactive: true,
  minAppVersion: '1.0.0',
  configSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', title: 'What is counted', maxLength: 80 },
      target: { type: 'integer', title: 'Target', minimum: 1, maximum: 100000 },
    },
    required: ['target'],
  },
  signals: [],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const label = r.str('label', { max: 80 });
    const target = r.int('target', { min: 1, max: 100000 });
    return { config: { label, target }, errors, refs: [] };
  },
  /**
   * report `{ add }` (1..200) or `{ set }` (resume: a whole number, never lower than the stored count). The count never passes
   * `config.target`; it is done at the target. An `add` less than 400 ms after the previous accepted one changes nothing (`tooFast`).
   * Anything else is `invalid` (the engine answers 400 bad_report).
   */
  evaluate(state, report, ctx) {
    const target = ctx.config.target;
    const now = ctx.now instanceof Date ? ctx.now.getTime() : Number(ctx.now ?? Date.now());
    const count = Number.isInteger(state?.count) ? state.count : 0;
    const lastAt = Number.isFinite(state?.lastAt) ? state.lastAt : null;
    const same = (extra = {}) => ({ state: { count, lastAt }, done: count >= target, how: null, ...extra });
    let next;
    let isAdd = false;
    if (Number.isInteger(report?.add)) {
      if (report.add < 1 || report.add > MAX_ADD) return same({ invalid: true });
      if (lastAt !== null && now - lastAt < MIN_ADD_INTERVAL_MS) return same({ tooFast: true });
      next = count + report.add;
      isAdd = true;
    } else if (Number.isInteger(report?.set) && report.set >= 0) next = Math.max(count, report.set);
    else return same({ invalid: true });
    next = Math.min(next, target);
    const done = next >= target;
    return {
      state: { count: next, lastAt: isAdd && next > count ? now : lastAt },
      done,
      how: done ? bilingual(`Counted ${target}`, `${target} गिनती पूरी`) : null,
    };
  },
  /** What the devotee's app may see of the stored state (no internal bookkeeping). */
  publicState: (state) => ({ count: Number.isInteger(state?.count) ? state.count : 0 }),
  summary: (config, lang) => (config.label
    ? pick(lang, `${config.label}: ${config.target}`, `${config.label}: ${config.target}`)
    : pick(lang, `Count to ${config.target}`, `${config.target} तक गिनें`)),
};
