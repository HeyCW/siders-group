const base = require('./base.cjs');

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
