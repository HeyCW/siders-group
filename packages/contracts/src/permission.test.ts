import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, permissionKeySchema } from './permission.js';

describe('permissionKeySchema', () => {
  it('accepts every catalog key', () => {
    for (const key of PERMISSION_KEYS) {
      expect(permissionKeySchema.parse(key)).toBe(key);
    }
  });

  it('rejects a key outside the catalog', () => {
    expect(() => permissionKeySchema.parse('billing.manage')).toThrow();
  });
});
