import { noConfig, bilingual, pick } from './kit.js';

export default {
  kind: 'self_mark',
  title: 'Mark as done',
  interactive: true,
  minAppVersion: '1.0.0',
  configSchema: noConfig,
  signals: [],
  validate: () => ({ config: {}, errors: [], refs: [] }),
  /** Done on any report while the milestone is open (the engine checks openness). */
  evaluate: (state) => ({ state: { ...(state || {}), done: true }, done: true, how: bilingual('Marked done', 'पूर्ण चिह्नित किया') }),
  publicState: () => ({}),
  summary: (_config, lang) => pick(lang, 'Mark it done', 'पूर्ण चिह्नित करें'),
};
