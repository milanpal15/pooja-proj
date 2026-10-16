/**
 * Load a module that may not be in this build. `probe` says whether its native half exists; `load`
 * requires it. Any failure — probe false, probe throws, require throws — is "not available" (null),
 * never an exception. Tested in optional-module.test.mjs.
 */
export function loadOptionalModule<T>(probe: () => boolean, load: () => T): T | null {
  try {
    if (!probe()) return null;
    return load() ?? null;
  } catch {
    return null;
  }
}
