import { describe, expect, it } from 'vitest';
import { toCommentQueueRow, toCommentReportResponse, toModerationActionResponse, toReaderQueueRow } from './moderation.mapper.js';
import type { CommentQueueRow, CommentReportRow, ModerationActionRow, ReaderQueueRow } from './moderation.repository.js';

function commentRow(overrides: Partial<CommentQueueRow> = {}): CommentQueueRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    body: 'Bagus sekali',
    status: 'visible',
    articleId: '22222222-2222-4222-8222-222222222222',
    articleTitle: 'Election results',
    articleSlug: 'election-results',
    authorName: 'Rina',
    createdAt: new Date('2026-08-17T04:00:00.000Z'),
    openReportCount: null,
    reportReasons: null,
    ...overrides,
  };
}

function reportRow(overrides: Partial<CommentReportRow> = {}): CommentReportRow {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    commentId: '11111111-1111-4111-8111-111111111111',
    reason: 'spam',
    note: 'Looks like a link farm',
    createdAt: new Date('2026-08-17T05:00:00.000Z'),
    ...overrides,
  };
}

function readerRow(overrides: Partial<ReaderQueueRow> = {}): ReaderQueueRow {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Rina',
    email: 'rina@example.com',
    avatarUrl: 'https://example.test/avatar.png',
    status: 'active',
    mutedUntil: null,
    commentCount: 4,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function actionRow(overrides: Partial<ModerationActionRow> = {}): ModerationActionRow {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    actorName: 'Dewi',
    targetType: 'comment',
    targetId: '11111111-1111-4111-8111-111111111111',
    action: 'comment_removed',
    reason: 'Spam',
    createdAt: new Date('2026-08-17T05:00:00.000Z'),
    ...overrides,
  };
}

describe('toCommentQueueRow', () => {
  it('formats createdAt as an ISO string', () => {
    expect(toCommentQueueRow(commentRow()).createdAt).toBe('2026-08-17T04:00:00.000Z');
  });

  it('carries the removed status through', () => {
    expect(toCommentQueueRow(commentRow({ status: 'removed' })).status).toBe('removed');
  });

  it('exposes exactly the public field set — no reader id or email', () => {
    expect(Object.keys(toCommentQueueRow(commentRow())).sort()).toEqual(
      ['articleId', 'articleSlug', 'articleTitle', 'authorName', 'body', 'createdAt', 'id', 'status'].sort(),
    );
  });
});

describe('toReaderQueueRow', () => {
  it('formats createdAt as an ISO string', () => {
    expect(toReaderQueueRow(readerRow()).createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('formats a set mutedUntil as an ISO string', () => {
    const result = toReaderQueueRow(readerRow({ mutedUntil: new Date('2026-08-18T00:00:00.000Z') }));
    expect(result.mutedUntil).toBe('2026-08-18T00:00:00.000Z');
  });

  it('carries a null mutedUntil through as null, not an empty string', () => {
    expect(toReaderQueueRow(readerRow({ mutedUntil: null })).mutedUntil).toBeNull();
  });

  it('carries the comment count through', () => {
    expect(toReaderQueueRow(readerRow({ commentCount: 12 })).commentCount).toBe(12);
  });
});

describe('toModerationActionResponse', () => {
  it('formats createdAt as an ISO string', () => {
    expect(toModerationActionResponse(actionRow()).createdAt).toBe('2026-08-17T05:00:00.000Z');
  });

  it('carries a null reason through as null', () => {
    expect(toModerationActionResponse(actionRow({ reason: null })).reason).toBeNull();
  });

  it('exposes exactly the actor name, never an actor id', () => {
    const result = toModerationActionResponse(actionRow());
    expect(result.actorName).toBe('Dewi');
    expect(result).not.toHaveProperty('actorId');
  });
});

describe('toCommentQueueRow — the report fields', () => {
  it('omits openReportCount and reportReasons entirely when there are none', () => {
    const result = toCommentQueueRow(commentRow({ openReportCount: null, reportReasons: null }));
    expect(result).not.toHaveProperty('openReportCount');
    expect(result).not.toHaveProperty('reportReasons');
  });

  it('omits both fields for a zero count, not just a null one', () => {
    const result = toCommentQueueRow(commentRow({ openReportCount: 0, reportReasons: [] }));
    expect(result).not.toHaveProperty('openReportCount');
    expect(result).not.toHaveProperty('reportReasons');
  });

  it('carries both fields when the comment has open reports', () => {
    const result = toCommentQueueRow(commentRow({ openReportCount: 3, reportReasons: ['spam', 'other'] }));
    expect(result.openReportCount).toBe(3);
    expect(result.reportReasons).toEqual(['spam', 'other']);
  });
});

describe('toCommentReportResponse', () => {
  it('formats createdAt as an ISO string', () => {
    expect(toCommentReportResponse(reportRow()).createdAt).toBe('2026-08-17T05:00:00.000Z');
  });

  it('carries a null note through as null', () => {
    expect(toCommentReportResponse(reportRow({ note: null })).note).toBeNull();
  });

  it('exposes no reporter identity', () => {
    const result = toCommentReportResponse(reportRow());
    expect(result).not.toHaveProperty('reporterId');
  });
});
