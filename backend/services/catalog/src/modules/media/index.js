import { setLegacyDir, uploads } from './uploads.routes.js';

export { uploadRoutes } from './upload.routes.js';

/** `GET|HEAD /media/:file` - the bytes behind `/uploads/<id>.<ext>`; Range, ETag, immutable cache, nosniff + CSP sandbox. */
export function mediaRoutes({ uploadDir } = {}) {
  setLegacyDir(uploadDir || null);
  return uploads;
}
