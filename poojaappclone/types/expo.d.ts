/**
 * Pulls in Expo's ambient types — notably the CSS module declarations that
 * `global.css` and `*.module.css` imports need.
 *
 * Expo generates `expo-env.d.ts` with this same reference, but that file is
 * gitignored (it is a build artifact, and Expo's own template ignores it),
 * so a clean checkout has nothing to pull them in. CI typechecked a tree
 * without it and failed with `Cannot find module './animated-icon.module.css'`
 * on code that compiles fine on a developer machine.
 *
 * Committing the reference here makes the typecheck depend on the repo
 * rather than on whether someone has run `expo start` recently. Duplicating
 * the generated file's single line is harmless: a repeated triple-slash
 * reference is idempotent.
 */

/// <reference types="expo/types" />
