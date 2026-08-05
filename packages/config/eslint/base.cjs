// Shared base rules re-exported for packages that need a CJS-consumable config.
// The root eslint.config.js is the actual flat config; this file documents the
// per-package override point until a package needs to diverge from it.
module.exports = {
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
  },
};
