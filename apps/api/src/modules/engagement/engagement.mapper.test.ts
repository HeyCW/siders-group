import { describe, expect, it } from 'vitest';
import { toArticleEngagement, toCommentResponse } from './engagement.mapper.js';
import type { CommentRow } from './engagement.repository.js';

function row(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    body: 'Bagus sekali',
    authorName: 'Rina',
    authorAvatarUrl: 'https://example.test/avatar.png',
    createdAt: new Date('2026-08-17T04:00:00.000Z'),
    ...overrides,
  };
}

describe('toCommentResponse', () => {
  it('formats createdAt as an ISO string', () => {
    expect(toCommentResponse(row()).createdAt).toBe('2026-08-17T04:00:00.000Z');
  });

  it('carries a null avatar through as null rather than dropping the key', () => {
    const result = toCommentResponse(row({ authorAvatarUrl: null }));
    expect(result.authorAvatarUrl).toBeNull();
    expect('authorAvatarUrl' in result).toBe(true);
  });

  it('exposes exactly the public fields — no reader id, no email', () => {
    expect(Object.keys(toCommentResponse(row())).sort()).toEqual([
      'authorAvatarUrl',
      'authorName',
      'body',
      'createdAt',
      'id',
    ]);
  });
});

describe('toArticleEngagement', () => {
  it('combines the article-wide counts with the caller-dependent like state', () => {
    const result = toArticleEngagement({ viewCount: 10, likeCount: 3, commentCount: 2 }, true);
    expect(result).toEqual({ viewCount: 10, likeCount: 3, commentCount: 2, likedByReader: true });
  });

  it('reports not-liked when the caller holds no like', () => {
    expect(toArticleEngagement({ viewCount: 0, likeCount: 0, commentCount: 0 }, false).likedByReader).toBe(false);
  });
});
