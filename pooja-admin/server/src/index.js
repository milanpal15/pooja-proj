import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';

import { announcements, policies } from './broadcast.js';
import { content, publicContent, UPLOAD_DIR, users } from './content.js';
import { connectDb } from './db.js';
import { router } from './routes.js';

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pooja_admin';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => res.json({ service: 'pooja-admin-api', ok: true }));
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api', router);
app.use('/api', publicContent); // GET /api/content for the app
app.use('/api/content', content); // deities/temples/aartis CRUD + upload
app.use('/api/users', users);
app.use('/api', policies);
app.use('/api', announcements);

connectDb(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`✓ API on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('✗ Failed to start — is MongoDB running?', err.message);
    process.exit(1);
  });
