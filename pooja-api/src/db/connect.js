import mongoose from 'mongoose';

import { seedDefaults } from './seed.js';

/**
 * A connection string with the password taken out, for logging.
 *
 * This line printed the URI verbatim, which put the database password into
 * the host's log history on every boot — a place that is retained, often
 * widely readable, and not somewhere a credential should ever reach.
 */
function redactUri(uri) {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    // Not parseable as a URL; show nothing rather than risk the password.
    return '(connection string hidden)';
  }
}

/**
 * Connect, and (by default) seed. The server passes `seed: false` and seeds after it is
 * listening — see `server.js` — so a slow seed cannot keep the port closed.
 */
export async function connectDb(uri, { seed = true } = {}) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('✓ MongoDB connected:', redactUri(uri));
  if (seed) await seedDefaults();
}
