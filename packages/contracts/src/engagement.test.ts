import { describe, expect, it } from 'vitest';
import {
  COMMENT_MAX_LENGTH,
  articleEngagementSchema,
  commentCreateRequestSchema,
  commentResponseSchema,
  likeToggleResponseSchema,
} from './engagement.js';

describe('commentCreateRequestSchema', () => {
  it('trims the body before storing it', () => {
    const parsed = commentCreateRequestSchema.parse({ body: '  hello  ' });
    expect(parsed.body).toBe('hello');
  });

  it('rejects an empty body', () => {
    expect(commentCreateRequestSchema.safeParse({ body: '' }).success).toBe(false);
  });

  it('rejects a whitespace-only body, which trimming would otherwise reduce to nothing', () => {
    expect(commentCreateRequestSchema.safeParse({ body: '   \n\t  ' }).success).toBe(false);
  });

  it('accepts a body at exactly the maximum length', () => {
    const body = 'a'.repeat(COMMENT_MAX_LENGTH);
    expect(commentCreateRequestSchema.safeParse({ body }).success).toBe(true);
  });

  it('rejects a body one character over the maximum', () => {
    const body = 'a'.repeat(COMMENT_MAX_LENGTH + 1);
    expect(commentCreateRequestSchema.safeParse({ body }).success).toBe(false);
  });

  it('applies the maximum to the trimmed body, so padding does not push a valid body over', () => {
    const body = `  ${'a'.repeat(COMMENT_MAX_LENGTH)}  `;
    expect(commentCreateRequestSchema.safeParse({ body }).success).toBe(true);
  });

  it('rejects a caller-supplied parentId, since comments are flat by construction', () => {
    const result = commentCreateRequestSchema.safeParse({
      body: 'a reply',
      parentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a caller-supplied status, so nothing outside the database can write removed', () => {
    expect(commentCreateRequestSchema.safeParse({ body: 'hi', status: 'removed' }).success).toBe(false);
  });

  it('rejects a caller-supplied readerId, which the session already determines', () => {
    const result = commentCreateRequestSchema.safeParse({
      body: 'hi',
      readerId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string body', () => {
    expect(commentCreateRequestSchema.safeParse({ body: 42 }).success).toBe(false);
  });
});

describe('articleEngagementSchema', () => {
  it('accepts a zero summary', () => {
    const result = articleEngagementSchema.safeParse({
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      likedByReader: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative count', () => {
    const result = articleEngagementSchema.safeParse({
      viewCount: -1,
      likeCount: 0,
      commentCount: 0,
      likedByReader: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a fractional count', () => {
    const result = articleEngagementSchema.safeParse({
      viewCount: 1.5,
      likeCount: 0,
      commentCount: 0,
      likedByReader: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('likeToggleResponseSchema', () => {
  it('accepts a toggle result', () => {
    expect(likeToggleResponseSchema.safeParse({ liked: true, likeCount: 3 }).success).toBe(true);
  });

  it('rejects a negative like count', () => {
    expect(likeToggleResponseSchema.safeParse({ liked: false, likeCount: -1 }).success).toBe(false);
  });
});

describe('commentResponseSchema', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    body: 'Bagus sekali',
    authorName: 'Rina',
    authorAvatarUrl: null,
    createdAt: '2026-08-17T04:00:00.000Z',
  };

  it('accepts a comment with no avatar', () => {
    expect(commentResponseSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a non-ISO createdAt', () => {
    expect(commentResponseSchema.safeParse({ ...base, createdAt: '2026-08-17' }).success).toBe(false);
  });

  it('carries no reader email or identifier', () => {
    const parsed = commentResponseSchema.parse({ ...base, email: 'rina@example.com' });
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('readerId');
  });
});
