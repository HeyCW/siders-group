import { describe, expect, it } from 'vitest';
import { homeCurationReplaceRequestSchema, homeFeedQuerySchema, MAX_HOME_CURATION_ENTRIES } from './curation.js';
import { MAX_PUBLIC_LIST_LIMIT } from './article.js';

const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}`;

describe('homeCurationReplaceRequestSchema', () => {
  it('accepts an empty list — there is no minimum', () => {
    const parsed = homeCurationReplaceRequestSchema.parse({ articleIds: [] });
    expect(parsed.articleIds).toEqual([]);
  });

  it('accepts up to the maximum number of entries', () => {
    const articleIds = Array.from({ length: MAX_HOME_CURATION_ENTRIES }, (_, i) => id(i));
    const parsed = homeCurationReplaceRequestSchema.parse({ articleIds });
    expect(parsed.articleIds).toHaveLength(MAX_HOME_CURATION_ENTRIES);
  });

  it('rejects more than the maximum number of entries', () => {
    const articleIds = Array.from({ length: MAX_HOME_CURATION_ENTRIES + 1 }, (_, i) => id(i));
    const result = homeCurationReplaceRequestSchema.safeParse({ articleIds });
    expect(result.success).toBe(false);
  });

  it('rejects a duplicate id within the submitted array', () => {
    const result = homeCurationReplaceRequestSchema.safeParse({ articleIds: [id(1), id(2), id(1)] });
    expect(result.success).toBe(false);
  });

  it('rejects a position field — positions are derived server-side from array order', () => {
    // specs/home-curation/spec.md - "Curation is replaced as a whole list": the client never
    // supplies a position, so the schema is `.strict()` and an extra field is a validation error
    // rather than a silently-ignored value.
    const result = homeCurationReplaceRequestSchema.safeParse({ articleIds: [id(1)], position: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid entry', () => {
    const result = homeCurationReplaceRequestSchema.safeParse({ articleIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });
});

describe('homeFeedQuerySchema', () => {
  it('defaults the limit when none is given', () => {
    const parsed = homeFeedQuerySchema.parse({});
    expect(parsed.limit).toBeGreaterThan(0);
  });

  it('clamps a limit above the maximum rather than rejecting it', () => {
    const parsed = homeFeedQuerySchema.parse({ limit: String(MAX_PUBLIC_LIST_LIMIT + 50) });
    expect(parsed.limit).toBe(MAX_PUBLIC_LIST_LIMIT);
  });

  it('rejects a zero or negative limit rather than clamping it', () => {
    expect(homeFeedQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(homeFeedQuerySchema.safeParse({ limit: '-1' }).success).toBe(false);
  });
});
