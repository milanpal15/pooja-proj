import multer from 'multer';

import { asyncRouter } from '../../lib/async-handler.js';
import { UPLOAD_EXTENSIONS, deleteFile, saveFile, uploadAllowed } from './files.js';

/**
 * `POST|DELETE /api/content/upload` (here `/content/upload`, behind the admin BFF's area gate: area `content`).
 * The BFF streams the multipart body through untouched; this is the only place it is parsed, with the same size limit
 * and extension allowlist the monolith used. `maxUploadMb` comes from config (MAX_UPLOAD_MB).
 */
export function uploadRoutes({ maxUploadMb }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadMb * 1024 * 1024 },
  });
  const router = asyncRouter();

  // Returns a HOST-RELATIVE URL for the uploaded file (image or audio). Clients
  // (dashboard + mobile app) resolve it against their own API base, so the same
  // stored value works from localhost, the LAN IP, or any future host.
  router.post(
    '/upload',
    (req, res, next) =>
      upload.single('file')(req, res, (err) => {
        // Multer's own errors are 500s otherwise, which reads as "the server
        // broke" for what is usually "that file is too big".
        if (err?.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `File is larger than ${maxUploadMb}MB.` });
        }
        if (err) return res.status(400).json({ error: 'The upload could not be read.' });
        next();
      }),
    async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'no file' });
      if (!uploadAllowed(req.file.originalname)) {
        return res.status(415).json({ error: `That file type is not allowed. Use ${UPLOAD_EXTENSIONS.join(', ')}.` });
      }
      try {
        const { url } = await saveFile(req.file);
        res.json({ url });
      } catch (e) {
        console.error('✗ upload failed:', e?.message || e);
        res.status(500).json({ error: 'The upload failed. Try again.' });
      }
    },
  );

  /** Drop a stored file. The URL is the one `/upload` handed back. */
  router.delete('/upload', async (req, res) => {
    const { url } = req.body ?? {};
    if (!url) return res.status(400).json({ error: 'no url' });
    res.json({ ok: await deleteFile(url) });
  });
  return router;
}
