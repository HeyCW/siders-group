import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../middleware/errorHandler.js';
import { createEngagementService } from './engagement.service.js';
import type { CommentRow, EngagementRepository } from './engagement.repository.js';

const ARTICLE = '11111111-1111-4111-8111-111111111111';
const HIDDEN_ARTICLE = '22222222-2222-4222-8222-222222222222';
const READER = '33333333-3333-4333-8333-333333333333';
const OTHER_READER = '44444444-4444-4444-8444-444444444444';

interface FakeState {
  /** Article ids that `isArticleEngageable` answers true for. */
  engageable: Set<string>;
  likes: Set<string>;
  comments: CommentRow[];
  views: { articleId: string; visitorHash: string }[];
  viewCount: number;
}

function createFakeRepository(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    engageable: new Set([ARTICLE]),
    likes: new Set<string>(),
    comments: [],
    views: [],
    viewCount: 0,
    ...overrides,
  };

  const likeKey = (articleId: string, readerId: string) => `${articleId}:${readerId}`;

  const repository: EngagementRepository = {
    async isArticleEngageable(articleId) {
      return state.engageable.has(articleId);
    },
    async recordView(articleId, visitorHash) {
      const isNew = !state.views.some((v) => v.articleId === articleId && v.visitorHash === visitorHash);
      state.views.push({ articleId, visitorHash });
      state.viewCount += 1;
      return isNew;
    },
    async toggleLike(articleId, readerId) {
      const key = likeKey(articleId, readerId);
      if (state.likes.has(key)) {
        state.likes.delete(key);
        return false;
      }
      state.likes.add(key);
      return true;
    },
    async hasLiked(articleId, readerId) {
      return state.likes.has(likeKey(articleId, readerId));
    },
    async getCounts(articleId) {
      return {
        viewCount: state.viewCount,
        likeCount: [...state.likes].filter((key) => key.startsWith(`${articleId}:`)).length,
        commentCount: state.comments.length,
      };
    },
    async createComment(_articleId, _readerId, body) {
      const row: CommentRow = {
        id: `comment-${state.comments.length + 1}`,
        body,
        authorName: 'Rina',
        authorAvatarUrl: null,
        createdAt: new Date('2026-08-17T04:00:00.000Z'),
      };
      state.comments = [row, ...state.comments];
      return row;
    },
    async listComments(_articleId, limit, offset) {
      return state.comments.slice(offset, offset + limit);
    },
  };

  return { repository, state };
}

describe('EngagementService — the public-visibility gate', () => {
  let service: ReturnType<typeof createEngagementService>;
  let state: FakeState;

  beforeEach(() => {
    const fake = createFakeRepository();
    service = createEngagementService(fake.repository);
    state = fake.state;
  });

  it('rejects a view for an article that is not publicly visible', async () => {
    await expect(service.recordView(HIDDEN_ARTICLE, 'hash')).rejects.toThrow(AppError);
    expect(state.views).toHaveLength(0);
  });

  it('rejects a like for an article that is not publicly visible', async () => {
    await expect(service.toggleLike(HIDDEN_ARTICLE, READER)).rejects.toThrow(AppError);
    expect(state.likes.size).toBe(0);
  });

  it('rejects a comment for an article that is not publicly visible', async () => {
    await expect(service.createComment(HIDDEN_ARTICLE, READER, 'hi')).rejects.toThrow(AppError);
    expect(state.comments).toHaveLength(0);
  });

  it('rejects a summary read for an article that is not publicly visible', async () => {
    await expect(service.getSummary(HIDDEN_ARTICLE, undefined)).rejects.toThrow(AppError);
  });

  it('rejects a comment listing for an article that is not publicly visible', async () => {
    await expect(service.listComments(HIDDEN_ARTICLE, 10, 0)).rejects.toThrow(AppError);
  });

  it('answers 404 rather than 403, so a draft is indistinguishable from a missing article', async () => {
    await expect(service.recordView(HIDDEN_ARTICLE, 'hash')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});

describe('EngagementService — likes', () => {
  it('records a first like and reports the resulting count', async () => {
    const { repository } = createFakeRepository();
    const service = createEngagementService(repository);

    const result = await service.toggleLike(ARTICLE, READER);

    expect(result).toEqual({ liked: true, likeCount: 1 });
  });

  it('removes an existing like on a second toggle', async () => {
    const { repository } = createFakeRepository();
    const service = createEngagementService(repository);

    await service.toggleLike(ARTICLE, READER);
    const result = await service.toggleLike(ARTICLE, READER);

    expect(result).toEqual({ liked: false, likeCount: 0 });
  });

  it('counts each reader once, so one reader unliking does not zero another reader"s like', async () => {
    const { repository } = createFakeRepository();
    const service = createEngagementService(repository);

    await service.toggleLike(ARTICLE, READER);
    await service.toggleLike(ARTICLE, OTHER_READER);
    const result = await service.toggleLike(ARTICLE, READER);

    expect(result).toEqual({ liked: false, likeCount: 1 });
  });

  it('reads the count back after the toggle rather than adjusting the caller"s number', async () => {
    const { repository, state } = createFakeRepository();
    const service = createEngagementService(repository);

    // Another reader likes it between this reader's toggle and the count read — the returned
    // count must reflect the database, not `previous + 1`.
    state.likes.add(`${ARTICLE}:${OTHER_READER}`);
    const result = await service.toggleLike(ARTICLE, READER);

    expect(result).toEqual({ liked: true, likeCount: 2 });
  });
});

describe('EngagementService — the summary', () => {
  it('reports likedByReader false for an anonymous caller rather than failing', async () => {
    const { repository, state } = createFakeRepository();
    state.likes.add(`${ARTICLE}:${READER}`);
    const service = createEngagementService(repository);

    const summary = await service.getSummary(ARTICLE, undefined);

    expect(summary.likedByReader).toBe(false);
    expect(summary.likeCount).toBe(1);
  });

  it('reports likedByReader true for the reader who liked it', async () => {
    const { repository, state } = createFakeRepository();
    state.likes.add(`${ARTICLE}:${READER}`);
    const service = createEngagementService(repository);

    const summary = await service.getSummary(ARTICLE, READER);

    expect(summary.likedByReader).toBe(true);
  });

  it('reports likedByReader false for a signed-in reader who has not liked it', async () => {
    const { repository, state } = createFakeRepository();
    state.likes.add(`${ARTICLE}:${OTHER_READER}`);
    const service = createEngagementService(repository);

    const summary = await service.getSummary(ARTICLE, READER);

    expect(summary.likedByReader).toBe(false);
  });

  it('carries every count through', async () => {
    const { repository, state } = createFakeRepository();
    state.viewCount = 42;
    state.likes.add(`${ARTICLE}:${READER}`);
    const service = createEngagementService(repository);
    await service.createComment(ARTICLE, READER, 'hi');

    const summary = await service.getSummary(ARTICLE, undefined);

    expect(summary).toEqual({ viewCount: 42, likeCount: 1, commentCount: 1, likedByReader: false });
  });
});

describe('EngagementService — comments', () => {
  it('returns the created comment in contract shape, with an ISO timestamp', async () => {
    const { repository } = createFakeRepository();
    const service = createEngagementService(repository);

    const comment = await service.createComment(ARTICLE, READER, 'Bagus sekali');

    expect(comment).toEqual({
      id: 'comment-1',
      body: 'Bagus sekali',
      authorName: 'Rina',
      authorAvatarUrl: null,
      createdAt: '2026-08-17T04:00:00.000Z',
    });
  });

  it('serves a comment body as literal text, never interpreted', async () => {
    const { repository } = createFakeRepository();
    const service = createEngagementService(repository);

    const comment = await service.createComment(ARTICLE, READER, '<script>alert(1)</script>');

    // Nothing on this path strips or escapes — the body is stored and returned verbatim, and the
    // web client renders it into a text node (design.md - "Comments: flat, instant, and
    // paginated like everything else").
    expect(comment.body).toBe('<script>alert(1)</script>');
  });

  it('pages through the listing by offset', async () => {
    const { repository } = createFakeRepository();
    const service = createEngagementService(repository);
    await service.createComment(ARTICLE, READER, 'first');
    await service.createComment(ARTICLE, READER, 'second');
    await service.createComment(ARTICLE, READER, 'third');

    const page1 = await service.listComments(ARTICLE, 2, 0);
    const page2 = await service.listComments(ARTICLE, 2, 2);

    expect(page1.map((c) => c.body)).toEqual(['third', 'second']);
    expect(page2.map((c) => c.body)).toEqual(['first']);
  });
});
