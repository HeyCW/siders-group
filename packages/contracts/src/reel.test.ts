import { describe, expect, it } from 'vitest';
import { reelCreateRequestSchema, reelUpdateRequestSchema } from './reel.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

describe('reelCreateRequestSchema', () => {
  it('accepts a valid create request', () => {
    const parsed = reelCreateRequestSchema.parse({
      url: 'https://www.instagram.com/reel/AbC-123x/',
      posterMediaId: id(1),
    });
    expect(parsed.posterMediaId).toBe(id(1));
  });

  it('requires posterMediaId', () => {
    const result = reelCreateRequestSchema.safeParse({ url: 'https://www.instagram.com/reel/AbC-123x/' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid posterMediaId', () => {
    const result = reelCreateRequestSchema.safeParse({
      url: 'https://www.instagram.com/reel/AbC-123x/',
      posterMediaId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an extra field, such as a client-supplied provider or externalId', () => {
    const result = reelCreateRequestSchema.safeParse({
      url: 'https://www.instagram.com/reel/AbC-123x/',
      posterMediaId: id(1),
      provider: 'instagram',
    });
    expect(result.success).toBe(false);
  });
});

describe('reelUpdateRequestSchema', () => {
  it('accepts a status-only update', () => {
    const parsed = reelUpdateRequestSchema.parse({ status: 'unavailable' });
    expect(parsed.status).toBe('unavailable');
  });

  it('rejects an unknown status value', () => {
    const result = reelUpdateRequestSchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(false);
  });

  it('does not accept a url or provider field — those are immutable after creation', () => {
    const result = reelUpdateRequestSchema.safeParse({ url: 'https://www.instagram.com/reel/AbC-123x/' });
    expect(result.success).toBe(false);
  });
});
