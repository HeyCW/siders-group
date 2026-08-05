import { describe, expect, it } from 'vitest';
import { pingResponseSchema } from './health.js';

describe('pingResponseSchema', () => {
  it('accepts a well-formed ping response', () => {
    const result = pingResponseSchema.parse({
      status: 'ok',
      timestamp: new Date('2026-08-04T00:00:00.000Z').toISOString(),
    });
    expect(result.status).toBe('ok');
  });

  it('rejects a non-ok status', () => {
    expect(() =>
      pingResponseSchema.parse({ status: 'down', timestamp: new Date().toISOString() }),
    ).toThrow();
  });
});
