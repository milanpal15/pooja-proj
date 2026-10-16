import { NotImplementedError, pick, reader } from './kit.js';

export default {
  kind: 'photo',
  title: 'Share a photo',
  interactive: true,
  minAppVersion: '1.1.0',
  configSchema: {
    type: 'object',
    properties: { needsApproval: { type: 'boolean', title: 'An operator approves it', default: true } },
    required: [],
  },
  signals: [],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    return { config: { needsApproval: r.bool('needsApproval', true) }, errors, refs: [] };
  },
  evaluate() {
    throw new NotImplementedError('photo'); // phase 4 (pending -> operator approves -> done)
  },
  summary: (_c, lang) => pick(lang, 'Share a photo', 'एक फ़ोटो साझा करें'),
};
