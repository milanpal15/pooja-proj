import { NotImplementedError, pick, reader } from './kit.js';

export default {
  kind: 'live_darshan',
  title: 'Watch live darshan',
  interactive: false,
  minAppVersion: '1.1.0',
  configSchema: {
    type: 'object',
    properties: {
      streamSlug: { type: 'string', title: 'Live stream', 'x-ref': 'stream' },
      minutes: { type: 'integer', title: 'Minutes to watch', minimum: 1, maximum: 600 },
    },
    required: ['streamSlug', 'minutes'],
  },
  signals: [],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const streamSlug = r.slug('streamSlug');
    const minutes = r.int('minutes', { min: 1, max: 600 });
    return { config: { streamSlug, minutes }, errors, refs: streamSlug ? [{ type: 'stream', slug: streamSlug, field: 'streamSlug' }] : [] };
  },
  evaluate() {
    throw new NotImplementedError('live_darshan'); // phase 3
  },
  summary: (c, lang) => pick(lang, `Watch live darshan for ${c.minutes} min`, `${c.minutes} मिनट लाइव दर्शन देखें`),
};
