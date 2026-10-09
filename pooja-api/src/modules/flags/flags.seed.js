import { DEFAULT_FLAGS } from './flag.defaults.js';
import { Flag } from './flag.model.js';

/** Insert any missing default flags (idempotent). */
export async function seedFlags() {
  for (const f of DEFAULT_FLAGS) {
    await Flag.updateOne({ key: f.key }, { $setOnInsert: f }, { upsert: true });
  }
}
