import multer from 'multer';

import { config } from '../../config/env.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { UPLOAD_EXTENSIONS, deleteFile, saveFile, uploadAllowed } from './files.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

/**
 * `POST|DELETE /api/content/upload` — mounted onto the `content` router, so
 * the public path is unchanged and the admin gate treats it like any other
 * content write.
 */
export const uploadRoutes = asyncRouter();

// Returns a HOST-RELATIVE URL for the uploaded file (image or audio). Clients
// (dashboard + mobile app) resolve it against their own API base, so the same
// stored value works from localhost, the LAN IP, or any future host.
uploadRoutes.post(
  '/upload',
  (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      // Multer's own errors are 500s otherwise, which reads as "the server
      // broke" for what is usually "that file is too big".
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File is larger than ${config.maxUploadMb}MB.` });
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
uploadRoutes.delete('/upload', async (req, res) => {
  const { url } = req.body ?? {};
  if (!url) return res.status(400).json({ error: 'no url' });
  res.json({ ok: await deleteFile(url) });
});
