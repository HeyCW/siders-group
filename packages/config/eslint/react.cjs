const base = require('./base.cjs');

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
