import { describe, expect, it } from 'vitest';
import {
  articleAutosaveRequestSchema,
  articleCreateRequestSchema,
  articlePublicListQuerySchema,
  articleSlugSchema,
  articleUpdateRequestSchema,
} from './article.js';

describe('articleCreateRequestSchema', () => {
  it('accepts a minimal article with only a title', () => {
    const parsed = articleCreateRequestSchema.parse({ title: 'A Title' });
    expect(parsed.title).toBe('A Title');
  });

  it('rejects an author_id field outright — the schema does not declare one', () => {
    // specs/article-management/spec.md - "Author derived from session": request schemas
    // SHALL NOT declare an author_id field, so a client-supplied one is a validation error,
    // not a silently-ignored value.
    const result = articleCreateRequestSchema.safeParse({ title: 'T', author_id: 'someone-else' });
    expect(result.success).toBe(false);
  });

  it('accepts categoryIds and tagIds as arrays, never a single categoryId', () => {
    const parsed = articleCreateRequestSchema.parse({
      title: 'T',
      categoryIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
      tagIds: ['33333333-3333-3333-3333-333333333333'],
    });
    expect(parsed.categoryIds).toHaveLength(2);
  });
});

describe('articleUpdateRequestSchema', () => {
  it('allows a manual slug override', () => {
    const parsed = articleUpdateRequestSchema.parse({ slug: 'custom-slug' });
    expect(parsed.slug).toBe('custom-slug');
  });
});

describe('articleAutosaveRequestSchema', () => {
  it('has no slug field at all — autosave cannot move the slug even if a client tries', () => {
    const result = articleAutosaveRequestSchema.safeParse({ title: 'T', slug: 'sneaky-slug' });
    expect(result.success).toBe(false);
  });

  it('has no status field at all — autosave cannot change status', () => {
    const result = articleAutosaveRequestSchema.safeParse({ title: 'T', status: 'published' });
    expect(result.success).toBe(false);
  });

  it('accepts a bare content update', () => {
    const parsed = articleAutosaveRequestSchema.parse({ bodyJson: { type: 'doc', content: [] } });
    expect(parsed.bodyJson).toBeDefined();
  });
});

describe('articleSlugSchema', () => {
  it('accepts a kebab-case slug', () => {
    expect(articleSlugSchema.safeParse('local-team-wins-cup').success).toBe(true);
  });

  it('rejects uppercase and spaces', () => {
    expect(articleSlugSchema.safeParse('Local Team').success).toBe(false);
  });
});

describe('articlePublicListQuerySchema', () => {
  it('applies default limit and offset', () => {
    const parsed = articlePublicListQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
  });

  it('caps the limit at 100', () => {
    const result = articlePublicListQuerySchema.safeParse({ limit: '500' });
    expect(result.success).toBe(false);
  });

  it('coerces string query values to numbers', () => {
    const parsed = articlePublicListQuerySchema.parse({ limit: '10', offset: '5' });
    expect(parsed.limit).toBe(10);
    expect(parsed.offset).toBe(5);
  });

  it('splits a comma-separated excludeIds string into an array of uuids', () => {
    const parsed = articlePublicListQuerySchema.parse({
      excludeIds: '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    });
    expect(parsed.excludeIds).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('leaves excludeIds undefined when omitted', () => {
    const parsed = articlePublicListQuerySchema.parse({});
    expect(parsed.excludeIds).toBeUndefined();
  });

  it('rejects a non-uuid entry in excludeIds', () => {
    const result = articlePublicListQuerySchema.safeParse({ excludeIds: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
