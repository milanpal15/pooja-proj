import { NotImplementedError, pick, reader } from './kit.js';

export default {
  kind: 'chadhava_offered',
  title: 'Make a chadhava offering',
  interactive: false,
  minAppVersion: '1.0.0',
  configSchema: {
    type: 'object',
    properties: { listingSlug: { type: 'string', title: 'Chadhava listing', 'x-ref': 'listing' } },
    required: ['listingSlug'],
  },
  signals: ['chadhava.offered'],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const listingSlug = r.slug('listingSlug');
    return { config: { listingSlug }, errors, refs: listingSlug ? [{ type: 'listing', slug: listingSlug, field: 'listingSlug' }] : [] };
  },
  evaluate() {
    throw new NotImplementedError('chadhava_offered'); // phase 3 (signal chadhava.offered)
  },
  summary: (_c, lang) => pick(lang, 'Make a chadhava offering', 'चढ़ावा अर्पित करें'),
};
