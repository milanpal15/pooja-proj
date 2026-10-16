import { NotImplementedError, pick, reader } from './kit.js';

export default {
  kind: 'bhajan_listened',
  title: 'Listen to a bhajan',
  interactive: false,
  minAppVersion: '1.1.0',
  configSchema: {
    type: 'object',
    properties: {
      aartiSlug: { type: 'string', title: 'Bhajan / aarti', 'x-ref': 'aarti' },
      minutes: { type: 'integer', title: 'Minutes to listen', minimum: 1, maximum: 600 },
    },
    required: ['aartiSlug', 'minutes'],
  },
  signals: [],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const aartiSlug = r.slug('aartiSlug');
    const minutes = r.int('minutes', { min: 1, max: 600 });
    return { config: { aartiSlug, minutes }, errors, refs: aartiSlug ? [{ type: 'aarti', slug: aartiSlug, field: 'aartiSlug' }] : [] };
  },
  evaluate() {
    throw new NotImplementedError('bhajan_listened'); // phase 3
  },
  summary: (c, lang) => pick(lang, `Listen for ${c.minutes} min`, `${c.minutes} मिनट सुनें`),
};
