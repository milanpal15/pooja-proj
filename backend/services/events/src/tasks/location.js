import { NotImplementedError, pick, reader } from './kit.js';

export default {
  kind: 'location',
  title: 'Be at a place',
  interactive: true,
  minAppVersion: '1.1.0',
  configSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', title: 'Latitude', minimum: -90, maximum: 90 },
      lng: { type: 'number', title: 'Longitude', minimum: -180, maximum: 180 },
      radiusM: { type: 'integer', title: 'Radius (metres)', minimum: 10, maximum: 50000 },
    },
    required: ['lat', 'lng', 'radiusM'],
  },
  signals: [],
  validate(config) {
    const errors = [];
    const r = reader(config, errors);
    const lat = r.num('lat', { min: -90, max: 90 });
    const lng = r.num('lng', { min: -180, max: 180 });
    const radiusM = r.int('radiusM', { min: 10, max: 50000 });
    return { config: { lat, lng, radiusM }, errors, refs: [] };
  },
  evaluate() {
    throw new NotImplementedError('location'); // phase 4 (client-reported: low-stakes only)
  },
  summary: (c, lang) => pick(lang, `Be within ${c.radiusM} m of the place`, `स्थान के ${c.radiusM} मीटर के भीतर रहें`),
};
