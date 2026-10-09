// https://docs.expo.dev/guides/using-eslint/
const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/*
 * Feature boundaries (DESIGN.md §13.2): a feature's internals are private.
 * Anything outside it — another feature, a route shim in src/app, a provider —
 * imports `@/features/<name>` (its index.ts) and nothing deeper.
 *
 * Two rules, because there are two ways to cross the line:
 *   1. Alias deep import   `@/features/wallet/hooks/use-recharge`  (everywhere)
 *   2. Relative cross-feature `../../wallet/hooks/...`  (inside a feature —
 *      the only place a relative path can reach a sibling feature)
 */
const FEATURES_DIR = path.join(__dirname, 'src', 'features');
const features = fs
  .readdirSync(FEATURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const DEEP_IMPORT = {
  group: ['@/features/*/*', '**/features/*/*'],
  message:
    "Import a feature through its index only: '@/features/<name>'. Move shared code down into components/ui, lib, hooks or providers.",
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Reanimated drives animations by assigning to `sharedValue.value`, including
    // inside worklets and gesture callbacks. React Compiler's immutability rule
    // flags those writes, but they are the library's intended API and are not
    // React state, so the warning is a false positive here.
    files: [
      'src/app/**',
      'src/components/illustrations/**',
      'src/features/pooja/**',
      'src/features/bhajan/**',
      'src/features/temples-map/**',
    ],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  {
    // Rule 1 — nobody deep-imports a feature.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DEEP_IMPORT] }],
    },
  },
  // Rule 2 — one block per feature, forbidding relative paths into its siblings.
  ...features.map((name) => ({
    files: [`src/features/${name}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            DEEP_IMPORT,
            {
              group: features.filter((f) => f !== name).map((f) => `../**/${f}/**`),
              message: `A feature may not reach into another feature by relative path. Import '@/features/<name>' instead.`,
            },
          ],
        },
      ],
    },
  })),
]);
