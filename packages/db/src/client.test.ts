import { describe, expect, it } from 'vitest';
import { getDb } from './client.js';

describe('getDb', () => {
  it('constructs a client without throwing given a connection string', () => {
    expect(() => getDb({ DATABASE_URL: 'postgres://user:pass@localhost:5432/db' })).not.toThrow();
  });
});
