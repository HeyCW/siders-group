import { describe, expect, it } from 'vitest';
import {
  commentModerateRequestSchema,
  commentQueueQuerySchema,
  commentQueueRowSchema,
  commentQueueStatusFilterSchema,
  commentReportReasonSchema,
  commentReportRequestSchema,
  commentReportsDismissRequestSchema,
  readerModerateRequestSchema,
  readerQueueQuerySchema,
  readerQueueStatusFilterSchema,
} from './moderation.js';

describe('commentQueueStatusFilterSchema', () => {
  it('accepts visible, removed, all, and reported', () => {
    expect(commentQueueStatusFilterSchema.safeParse('visible').success).toBe(true);
    expect(commentQueueStatusFilterSchema.safeParse('removed').success).toBe(true);
    expect(commentQueueStatusFilterSchema.safeParse('all').success).toBe(true);
    expect(commentQueueStatusFilterSchema.safeParse('reported').success).toBe(true);
  });

  it('rejects a status outside the filter set', () => {
    expect(commentQueueStatusFilterSchema.safeParse('draft').success).toBe(false);
  });
});

describe('commentReportReasonSchema', () => {
  it('accepts every catalog reason', () => {
    for (const reason of ['spam', 'harassment', 'off_topic', 'other']) {
      expect(commentReportReasonSchema.safeParse(reason).success).toBe(true);
    }
  });

  it('rejects a reason outside the catalog', () => {
    expect(commentReportReasonSchema.safeParse('defamation').success).toBe(false);
  });
});

describe('commentReportRequestSchema', () => {
  it('accepts a reason with no note', () => {
    expect(commentReportRequestSchema.safeParse({ reason: 'spam' }).success).toBe(true);
  });

  it('accepts a reason with a note', () => {
    const parsed = commentReportRequestSchema.parse({ reason: 'harassment', note: 'Targets another reader by name' });
    expect(parsed.note).toBe('Targets another reader by name');
  });

  it('requires a reason', () => {
    expect(commentReportRequestSchema.safeParse({ note: 'no reason given' }).success).toBe(false);
  });

  it('rejects a reason outside the catalog', () => {
    expect(commentReportRequestSchema.safeParse({ reason: 'defamation' }).success).toBe(false);
  });

  it('rejects a whitespace-only note', () => {
    expect(commentReportRequestSchema.safeParse({ reason: 'spam', note: '   ' }).success).toBe(false);
  });

  it('rejects a caller-supplied commentId, which the path already names', () => {
    const result = commentReportRequestSchema.safeParse({
      reason: 'spam',
      commentId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a caller-supplied reporterId, which the session already names', () => {
    const result = commentReportRequestSchema.safeParse({
      reason: 'spam',
      reporterId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });
});

describe('commentReportsDismissRequestSchema', () => {
  it('accepts an empty body', () => {
    expect(commentReportsDismissRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a reason', () => {
    expect(commentReportsDismissRequestSchema.safeParse({ reason: 'Not a real violation' }).success).toBe(true);
  });

  it('rejects a caller-supplied status — dismissing never touches the comment status', () => {
    expect(commentReportsDismissRequestSchema.safeParse({ status: 'removed' }).success).toBe(false);
  });
});

describe('commentQueueRowSchema — the report fields', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    body: 'Bagus sekali',
    status: 'visible' as const,
    articleId: '22222222-2222-4222-8222-222222222222',
    articleTitle: 'Election results',
    articleSlug: 'election-results',
    authorName: 'Rina',
    createdAt: '2026-08-17T04:00:00.000Z',
  };

  it('accepts a row with neither report field', () => {
    expect(commentQueueRowSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a row carrying an open report count and reasons', () => {
    const result = commentQueueRowSchema.safeParse({ ...base, openReportCount: 2, reportReasons: ['spam', 'other'] });
    expect(result.success).toBe(true);
  });

  it('rejects a zero open report count — absence, not zero, is how "no reports" is represented', () => {
    expect(commentQueueRowSchema.safeParse({ ...base, openReportCount: 0 }).success).toBe(false);
  });

  it('rejects an empty reportReasons array', () => {
    expect(commentQueueRowSchema.safeParse({ ...base, reportReasons: [] }).success).toBe(false);
  });
});

describe('commentQueueQuerySchema', () => {
  it('defaults to the all filter and the default limit with no cursor', () => {
    const parsed = commentQueueQuerySchema.parse({});
    expect(parsed).toEqual({ status: 'all', limit: 20 });
  });

  it('accepts a cursor as an opaque string', () => {
    const parsed = commentQueueQuerySchema.parse({ cursor: 'anything-the-server-issued' });
    expect(parsed.cursor).toBe('anything-the-server-issued');
  });

  it('clamps a limit above the ceiling rather than rejecting it', () => {
    const parsed = commentQueueQuerySchema.parse({ limit: '9999' });
    expect(parsed.limit).toBe(100);
  });

  it('rejects a zero or negative limit, which is malformed rather than merely oversized', () => {
    expect(commentQueueQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(commentQueueQuerySchema.safeParse({ limit: '-1' }).success).toBe(false);
  });

  it('never accepts a numeric offset — the queue is keyset-paginated only', () => {
    const parsed = commentQueueQuerySchema.parse({ offset: '10' });
    expect(parsed).not.toHaveProperty('offset');
  });
});

describe('commentModerateRequestSchema', () => {
  it('accepts a remove with no reason', () => {
    expect(commentModerateRequestSchema.safeParse({ status: 'removed' }).success).toBe(true);
  });

  it('accepts a restore with a reason', () => {
    const parsed = commentModerateRequestSchema.parse({ status: 'visible', reason: 'False positive' });
    expect(parsed.reason).toBe('False positive');
  });

  it('rejects a status outside visible/removed, matching what an action can set', () => {
    expect(commentModerateRequestSchema.safeParse({ status: 'all' }).success).toBe(false);
    expect(commentModerateRequestSchema.safeParse({ status: 'draft' }).success).toBe(false);
  });

  it('rejects a whitespace-only reason', () => {
    expect(commentModerateRequestSchema.safeParse({ status: 'removed', reason: '   ' }).success).toBe(false);
  });

  it('rejects an over-long reason', () => {
    const reason = 'a'.repeat(501);
    expect(commentModerateRequestSchema.safeParse({ status: 'removed', reason }).success).toBe(false);
  });

  it('rejects a caller-supplied articleId, which the path already names', () => {
    const result = commentModerateRequestSchema.safeParse({
      status: 'removed',
      articleId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });

  it('requires a status', () => {
    expect(commentModerateRequestSchema.safeParse({ reason: 'why' }).success).toBe(false);
  });
});

describe('readerQueueStatusFilterSchema', () => {
  it('accepts active, banned, and all', () => {
    expect(readerQueueStatusFilterSchema.safeParse('active').success).toBe(true);
    expect(readerQueueStatusFilterSchema.safeParse('banned').success).toBe(true);
    expect(readerQueueStatusFilterSchema.safeParse('all').success).toBe(true);
  });

  it('rejects removed, which is a comment status, not a reader one', () => {
    expect(readerQueueStatusFilterSchema.safeParse('removed').success).toBe(false);
  });
});

describe('readerQueueQuerySchema', () => {
  it('defaults to the all filter, no search, and offset 0', () => {
    const parsed = readerQueueQuerySchema.parse({});
    expect(parsed).toMatchObject({ status: 'all', offset: 0 });
    expect(parsed.search).toBeUndefined();
  });

  it('accepts a search term', () => {
    expect(readerQueueQuerySchema.parse({ search: 'rina' }).search).toBe('rina');
  });

  it('rejects a whitespace-only search term as though none were given, trimming to empty', () => {
    // `.trim().min(1)` on an optional field: whitespace trims to empty and then fails `.min(1)`.
    expect(readerQueueQuerySchema.safeParse({ search: '   ' }).success).toBe(false);
  });

  it('clamps a limit above the ceiling', () => {
    expect(readerQueueQuerySchema.parse({ limit: '9999' }).limit).toBe(100);
  });
});

describe('readerModerateRequestSchema', () => {
  it('accepts a ban', () => {
    expect(readerModerateRequestSchema.safeParse({ status: 'banned' }).success).toBe(true);
  });

  it('accepts an unban', () => {
    expect(readerModerateRequestSchema.safeParse({ status: 'active' }).success).toBe(true);
  });

  it('accepts a mute — a future ISO datetime', () => {
    const result = readerModerateRequestSchema.safeParse({ mutedUntil: '2099-01-01T00:00:00.000Z' });
    expect(result.success).toBe(true);
  });

  it('accepts an unmute — an explicit null', () => {
    expect(readerModerateRequestSchema.safeParse({ mutedUntil: null }).success).toBe(true);
  });

  it('accepts a mute-duration preset the UI computed into an ISO datetime', () => {
    const in24h = new Date(Date.parse('2026-08-17T00:00:00.000Z') + 24 * 60 * 60 * 1000).toISOString();
    expect(readerModerateRequestSchema.safeParse({ mutedUntil: in24h }).success).toBe(true);
  });

  it('rejects a request naming neither status nor mutedUntil', () => {
    expect(readerModerateRequestSchema.safeParse({ reason: 'why' }).success).toBe(false);
  });

  it('rejects a non-ISO mutedUntil', () => {
    expect(readerModerateRequestSchema.safeParse({ mutedUntil: '2026-08-17' }).success).toBe(false);
  });

  it('accepts both axes in one request', () => {
    const result = readerModerateRequestSchema.safeParse({ status: 'banned', mutedUntil: null });
    expect(result.success).toBe(true);
  });

  it('rejects a caller-supplied actorId, which the session already names', () => {
    const result = readerModerateRequestSchema.safeParse({
      status: 'banned',
      actorId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.success).toBe(false);
  });
});
