import { readFile } from 'node:fs/promises';

import { HttpError } from '../../lib/http-error.js';
import { validateLayout } from './layout.validate.js';

export const DEFAULT_LAYOUT_PATH = new URL('./default-layout.json', import.meta.url);

/** The built-in default (default-layout.json, normalised by the validator). Read from disk each time: it is tiny and rarely asked for. */
export async function loadDefaultLayout() {
  const { doc, fields } = validateLayout(JSON.parse(await readFile(DEFAULT_LAYOUT_PATH, 'utf8')));
  if (!doc) throw new HttpError(500, 'bad_default_layout', `default-layout.json does not validate: ${JSON.stringify(fields)}`);
  return doc;
}
