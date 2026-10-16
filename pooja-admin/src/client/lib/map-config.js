import { resolveStyleUrl } from './geo.js';

/** The map style URL. Override at build time with `VITE_MAP_STYLE_URL`; default is OpenFreeMap (no key). */
export const MAP_STYLE_URL = resolveStyleUrl(import.meta.env?.VITE_MAP_STYLE_URL);
