import { NotImplementedError, noConfig, pick } from './kit.js';

export default {
  kind: 'qr_checkin',
  title: 'Check in at the venue (QR)',
  interactive: false,
  minAppVersion: '1.1.0',
  configSchema: noConfig,
  signals: [],
  validate: () => ({ config: {}, errors: [], refs: [] }),
  evaluate() {
    throw new NotImplementedError('qr_checkin'); // phase 4 (volunteer scan)
  },
  summary: (_c, lang) => pick(lang, 'Check in at the venue', 'स्थल पर चेक-इन करें'),
};
