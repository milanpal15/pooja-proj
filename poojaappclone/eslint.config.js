// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

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
    files: ['src/app/**', 'src/components/pooja/**', 'src/components/mandir/**'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
]);
