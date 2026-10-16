import { NotImplementedError, pick, reader } from './kit.js';

export default {
  kind: 'pooja_booked',
  title: 'Book a pooja',
  interactive: false,
  minAppVersion: '1.0.0',
  configSchema: {
    type: 'object',
    properties: { poojaSlug: { type: 'string', title: 'Pooja', 'x-ref': 'pooja' } },
    required: ['poojaSlug'],
  },
  signals: ['pooja.booked'],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const poojaSlug = r.slug('poojaSlug');
    return { config: { poojaSlug }, errors, refs: poojaSlug ? [{ type: 'pooja', slug: poojaSlug, field: 'poojaSlug' }] : [] };
  },
  evaluate() {
    throw new NotImplementedError('pooja_booked'); // phase 3 (signal pooja.booked)
  },
  summary: (_c, lang) => pick(lang, 'Book a pooja', 'पूजा बुक करें'),
};
