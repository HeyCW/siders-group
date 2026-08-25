import { describe, expect, it } from 'vitest';
import { withTableWriteLock } from './tableWriteLock.js';

/**
 * MySQL's `GET_LOCK` rejects a name over 64 characters as a syntax-adjacent driver error, not
 * something `dbErrors.ts` can classify — caught during implementation when an integration test
 * happened to use a long generated table name and the lock call failed with a raw, confusing
 * driver error instead of anything actionable. Every real call site passes a short static table
 * name (`partners`, `guide_picks`, `anak_usaha_profile`, `home_curation`), so this is a
 * defensive guard against a future call site accidentally exceeding it, not a scenario that
 * occurs in the current codebase.
 */
describe('withTableWriteLock', () => {
  it('throws a clear error before touching the database when the lock name would exceed 64 characters', async () => {
    const fakeTx = { execute: () => Promise.reject(new Error('should not be called')) };
    const tooLongTableName = 'a'.repeat(64);

    await expect(withTableWriteLock(fakeTx as never, tooLongTableName, async () => 'unreachable')).rejects.toThrow(
      /64/,
    );
  });
});
