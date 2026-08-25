import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../middleware/errorHandler.js';
import { createModerationService, decodeCursor, encodeCursor, planReaderModeration } from './moderation.service.js';
import type {
  CommentModerationStatus,
  CommentQueueFilter,
  CommentQueueRow,
  CommentReportRow,
  ModerationActionInput,
  ModerationRepository,
  ReaderModerationStatus,
  ReaderQueueFilter,
  ReaderQueueRow,
} from './moderation.repository.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const COMMENT_ID = '22222222-2222-4222-8222-222222222222';
const READER_ID = '33333333-3333-4333-8333-333333333333';
const REPORTER_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_REPORTER_ID = '66666666-6666-4666-8666-666666666666';
const UNKNOWN_ID = '44444444-4444-4444-8444-444444444444';

function commentRow(overrides: Partial<CommentQueueRow> = {}): CommentQueueRow {
  return {
    id: COMMENT_ID,
    body: 'Bagus sekali',
    status: 'visible',
    articleId: 'article-1',
    articleTitle: 'Election results',
    articleSlug: 'election-results',
    authorName: 'Rina',
    createdAt: new Date('2026-08-17T04:00:00.000Z'),
    openReportCount: null,
    reportReasons: null,
    ...overrides,
  };
}

/** Mimics `mysql2`'s shape for a unique-violation error closely enough for `isUniqueViolation`
 *  to recognize it. */
function uniqueViolation(): Error {
  return Object.assign(new Error("Duplicate entry '...' for key 'comment_reports.comment_reports_comment_reporter_unique'"), {
    errno: 1062,
    code: 'ER_DUP_ENTRY',
  });
}

function readerRow(overrides: Partial<ReaderQueueRow> = {}): ReaderQueueRow {
  return {
    id: READER_ID,
    name: 'Rina',
    email: 'rina@example.com',
    avatarUrl: null,
    status: 'active',
    mutedUntil: null,
    commentCount: 3,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

interface FakeReport {
  id: string;
  commentId: string;
  reporterId: string;
  reason: CommentReportRow['reason'];
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

interface FakeState {
  comments: Map<string, CommentQueueRow>;
  readers: Map<string, { status: ReaderModerationStatus; mutedUntil: Date | null; row: ReaderQueueRow }>;
  loggedActions: Array<{ targetType: 'comment' | 'reader'; targetId: string; entries: ModerationActionInput[] }>;
  reports: FakeReport[];
}

function createFakeRepository(): { repository: ModerationRepository; state: FakeState } {
  const state: FakeState = {
    comments: new Map([[COMMENT_ID, commentRow()]]),
    readers: new Map([[READER_ID, { status: 'active', mutedUntil: null, row: readerRow() }]]),
    loggedActions: [],
    reports: [],
  };

  const repository: ModerationRepository = {
    async findCommentById(id) {
      return state.comments.get(id) ?? null;
    },
    async listCommentQueue(_filter: CommentQueueFilter) {
      return { items: [...state.comments.values()], nextCursorSource: undefined };
    },
    async setCommentStatus(id, status: CommentModerationStatus, logEntry) {
      const existing = state.comments.get(id);
      if (!existing) throw new Error('comment missing');
      // Removal resolves open reports in the same operation; restoring never reopens them
      // (design.md - Decision 8) — mirrored here so the fake's behavior actually exercises that
      // rule rather than merely asserting it elsewhere.
      if (status === 'removed') {
        for (const report of state.reports) {
          if (report.commentId === id && report.resolvedAt === null) report.resolvedAt = new Date();
        }
      }
      const updated = { ...existing, status };
      state.comments.set(id, updated);
      state.loggedActions.push({ targetType: 'comment', targetId: id, entries: [logEntry] });
      return updated;
    },
    async dismissReports(commentId, _resolvedBy, logEntry) {
      const open = state.reports.filter((r) => r.commentId === commentId && r.resolvedAt === null);
      if (open.length === 0) return null;
      for (const report of open) report.resolvedAt = new Date();
      state.loggedActions.push({ targetType: 'comment', targetId: commentId, entries: [logEntry] });
      return state.comments.get(commentId) ?? null;
    },
    async createReport(commentId, reporterId, reason, note) {
      if (state.reports.some((r) => r.commentId === commentId && r.reporterId === reporterId)) {
        throw uniqueViolation();
      }
      const report: FakeReport = {
        id: `report-${state.reports.length + 1}`,
        commentId,
        reporterId,
        reason,
        note,
        createdAt: new Date('2026-08-17T06:00:00.000Z'),
        resolvedAt: null,
      };
      state.reports.push(report);
      return report;
    },
    async findReaderById(id) {
      const entry = state.readers.get(id);
      return entry ? { id, status: entry.status, mutedUntil: entry.mutedUntil } : null;
    },
    async getReaderRow(id) {
      return state.readers.get(id)?.row ?? null;
    },
    async listReaders(_filter: ReaderQueueFilter) {
      return [...state.readers.values()].map((entry) => entry.row);
    },
    async updateReader(id, patch, logEntries) {
      const entry = state.readers.get(id);
      if (!entry) throw new Error('reader missing');
      const nextStatus = patch.status ?? entry.status;
      const nextMutedUntil = patch.mutedUntil !== undefined ? patch.mutedUntil : entry.mutedUntil;
      const updatedRow = { ...entry.row, status: nextStatus, mutedUntil: nextMutedUntil };
      state.readers.set(id, { status: nextStatus, mutedUntil: nextMutedUntil, row: updatedRow });
      state.loggedActions.push({ targetType: 'reader', targetId: id, entries: logEntries });
      return updatedRow;
    },
    async listActionsForTarget() {
      return [];
    },
  };

  return { repository, state };
}

describe('ModerationService — not-found handling', () => {
  it('rejects moderating an unknown comment, recording nothing', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(service.moderateComment(UNKNOWN_ID, { status: 'removed' }, ACTOR)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(state.loggedActions).toHaveLength(0);
  });

  it('rejects moderating an unknown reader, recording nothing', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(
      service.moderateReader(UNKNOWN_ID, { status: 'banned' }, ACTOR, new Date('2026-08-17T00:00:00.000Z')),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
    expect(state.loggedActions).toHaveLength(0);
  });

  it('answers 404, not some other status, for both target types', async () => {
    const { repository } = createFakeRepository();
    const service = createModerationService(repository);

    const commentErr = await service.moderateComment(UNKNOWN_ID, { status: 'removed' }, ACTOR).catch((e) => e);
    const readerErr = await service
      .moderateReader(UNKNOWN_ID, { status: 'banned' }, ACTOR, new Date())
      .catch((e) => e);

    expect(commentErr).toBeInstanceOf(AppError);
    expect(readerErr).toBeInstanceOf(AppError);
  });

  it('rejects dismissing reports on an unknown comment, recording nothing', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(service.dismissCommentReports(UNKNOWN_ID, undefined, ACTOR)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(state.loggedActions).toHaveLength(0);
  });

  it('rejects reporting an unknown comment, recording nothing', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(service.fileReport(UNKNOWN_ID, REPORTER_ID, 'spam', undefined)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(state.reports).toHaveLength(0);
  });

  it('answers not found for an existing comment with no open reports, same as an unknown id', async () => {
    // Per tasks.md 3.4: "404 for an unknown id or one with no open reports to dismiss" — the two
    // cases are deliberately indistinguishable to the caller.
    const { repository } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(service.dismissCommentReports(COMMENT_ID, undefined, ACTOR)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});

describe('ModerationService — comment moderation writes exactly one record', () => {
  it('removing a comment writes one comment_removed record', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    const result = await service.moderateComment(COMMENT_ID, { status: 'removed', reason: 'Spam' }, ACTOR);

    expect(result.status).toBe('removed');
    expect(state.loggedActions).toHaveLength(1);
    expect(state.loggedActions[0]).toMatchObject({
      targetType: 'comment',
      targetId: COMMENT_ID,
      entries: [{ actorId: ACTOR, action: 'comment_removed', reason: 'Spam' }],
    });
  });

  it('restoring a comment writes one comment_restored record', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);
    await service.moderateComment(COMMENT_ID, { status: 'removed' }, ACTOR);

    const result = await service.moderateComment(COMMENT_ID, { status: 'visible' }, ACTOR);

    expect(result.status).toBe('visible');
    expect(state.loggedActions).toHaveLength(2);
    expect(state.loggedActions[1]?.entries[0]?.action).toBe('comment_restored');
  });

  it('stores a null reason when none is given, not an empty string', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await service.moderateComment(COMMENT_ID, { status: 'removed' }, ACTOR);

    expect(state.loggedActions[0]?.entries[0]?.reason).toBeNull();
  });

  it('removing a comment resolves its open reports in the same operation', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);
    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);

    await service.moderateComment(COMMENT_ID, { status: 'removed' }, ACTOR);

    expect(state.reports[0]?.resolvedAt).not.toBeNull();
  });

  it('restoring a comment does not reopen reports that its earlier removal resolved', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);
    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);
    await service.moderateComment(COMMENT_ID, { status: 'removed' }, ACTOR);
    const resolvedAt = state.reports[0]?.resolvedAt;

    await service.moderateComment(COMMENT_ID, { status: 'visible' }, ACTOR);

    expect(state.reports[0]?.resolvedAt).toEqual(resolvedAt);
  });
});

describe('ModerationService — reporting a comment', () => {
  it('files a report attributed to the reporting reader', async () => {
    const { repository } = createFakeRepository();
    const service = createModerationService(repository);

    const result = await service.fileReport(COMMENT_ID, REPORTER_ID, 'harassment', 'Targets another reader by name');

    expect(result).toMatchObject({ commentId: COMMENT_ID, reason: 'harassment', note: 'Targets another reader by name' });
  });

  it('rejects a second report from the same reader on the same comment', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);
    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);

    await expect(service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined)).rejects.toMatchObject({
      status: 409,
      code: 'already_reported',
    });
    expect(state.reports).toHaveLength(1);
  });

  it('allows a second reader to report the same comment', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);
    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);

    await service.fileReport(COMMENT_ID, OTHER_REPORTER_ID, 'harassment', undefined);

    expect(state.reports).toHaveLength(2);
  });

  it('files no moderation_actions row — filing a report is a reader action, not a staff one', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);

    expect(state.loggedActions).toHaveLength(0);
  });
});

describe('ModerationService — dismissing a comment\'s reports', () => {
  it('resolves every open report and writes one comment_reports_dismissed record', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);
    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);
    await service.fileReport(COMMENT_ID, OTHER_REPORTER_ID, 'other', undefined);

    await service.dismissCommentReports(COMMENT_ID, 'Reviewed, not a violation', ACTOR);

    expect(state.reports.every((r) => r.resolvedAt !== null)).toBe(true);
    expect(state.loggedActions).toHaveLength(1);
    expect(state.loggedActions[0]).toMatchObject({
      targetType: 'comment',
      targetId: COMMENT_ID,
      entries: [{ actorId: ACTOR, action: 'comment_reports_dismissed', reason: 'Reviewed, not a violation' }],
    });
  });

  it('leaves the comment status untouched', async () => {
    const { repository } = createFakeRepository();
    const service = createModerationService(repository);
    await service.fileReport(COMMENT_ID, REPORTER_ID, 'spam', undefined);

    const result = await service.dismissCommentReports(COMMENT_ID, undefined, ACTOR);

    expect(result.status).toBe('visible');
  });
});

describe('ModerationService — reader moderation writes exactly one record per real transition', () => {
  it('banning a reader writes one reader_banned record', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    const result = await service.moderateReader(READER_ID, { status: 'banned' }, ACTOR, new Date('2026-08-17T00:00:00.000Z'));

    expect(result.status).toBe('banned');
    expect(state.loggedActions).toHaveLength(1);
    expect(state.loggedActions[0]?.entries).toEqual([{ actorId: ACTOR, action: 'reader_banned', reason: null }]);
  });

  it('unbanning a banned reader writes one reader_unbanned record', async () => {
    const { repository, state } = createFakeRepository();
    const now = new Date('2026-08-17T00:00:00.000Z');
    const service = createModerationService(repository);
    await service.moderateReader(READER_ID, { status: 'banned' }, ACTOR, now);

    await service.moderateReader(READER_ID, { status: 'active' }, ACTOR, now);

    expect(state.loggedActions[1]?.entries[0]?.action).toBe('reader_unbanned');
  });

  it('muting a reader writes one reader_muted record', async () => {
    const { repository, state } = createFakeRepository();
    const now = new Date('2026-08-17T00:00:00.000Z');
    const service = createModerationService(repository);

    const result = await service.moderateReader(READER_ID, { mutedUntil: '2026-08-18T00:00:00.000Z' }, ACTOR, now);

    expect(result.mutedUntil).toBe('2026-08-18T00:00:00.000Z');
    expect(state.loggedActions[0]?.entries[0]?.action).toBe('reader_muted');
  });

  it('unmuting an actively muted reader writes one reader_unmuted record', async () => {
    const { repository, state } = createFakeRepository();
    const now = new Date('2026-08-17T00:00:00.000Z');
    const service = createModerationService(repository);
    await service.moderateReader(READER_ID, { mutedUntil: '2026-08-18T00:00:00.000Z' }, ACTOR, now);

    await service.moderateReader(READER_ID, { mutedUntil: null }, ACTOR, now);

    expect(state.loggedActions[1]?.entries[0]?.action).toBe('reader_unmuted');
  });

  it('a reader ban does not touch any comment row', async () => {
    const { repository, state } = createFakeRepository();
    const before = state.comments.get(COMMENT_ID);
    const service = createModerationService(repository);

    await service.moderateReader(READER_ID, { status: 'banned' }, ACTOR, new Date('2026-08-17T00:00:00.000Z'));

    // design.md - Decision 5: banning acts only on `readers`, never on `comments`.
    expect(state.comments.get(COMMENT_ID)).toEqual(before);
    expect(state.loggedActions.every((entry) => entry.targetType !== 'comment')).toBe(true);
  });

  it('ban and mute submitted together in one call write two records', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await service.moderateReader(
      READER_ID,
      { status: 'banned', mutedUntil: '2026-08-18T00:00:00.000Z' },
      ACTOR,
      new Date('2026-08-17T00:00:00.000Z'),
    );

    expect(state.loggedActions).toHaveLength(1);
    expect(state.loggedActions[0]?.entries.map((e) => e.action).sort()).toEqual(['reader_banned', 'reader_muted']);
  });

  it('re-sending the reader\'s current status writes no record', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    const result = await service.moderateReader(READER_ID, { status: 'active' }, ACTOR, new Date('2026-08-17T00:00:00.000Z'));

    expect(result.status).toBe('active');
    expect(state.loggedActions).toHaveLength(0);
  });

  it('rejects a mutedUntil that is not in the future', async () => {
    const { repository, state } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(
      service.moderateReader(READER_ID, { mutedUntil: '2020-01-01T00:00:00.000Z' }, ACTOR, new Date('2026-08-17T00:00:00.000Z')),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_mute_duration' });
    expect(state.loggedActions).toHaveLength(0);
  });
});

describe('ModerationService — the comment queue passes filters through and encodes the cursor', () => {
  it('decodes a caller-supplied cursor before querying the repository', async () => {
    const { repository } = createFakeRepository();
    const listSpy = vi.spyOn(repository, 'listCommentQueue');
    const service = createModerationService(repository);
    const cursor = encodeCursor({ createdAt: new Date('2026-08-16T00:00:00.000Z'), id: 'prev-id' });

    await service.listCommentQueue({ status: 'removed', cursor, limit: 20 });

    expect(listSpy).toHaveBeenCalledWith({
      status: 'removed',
      cursor: { createdAt: new Date('2026-08-16T00:00:00.000Z'), id: 'prev-id' },
      limit: 20,
    });
  });

  it('passes no cursor on the first page', async () => {
    const { repository } = createFakeRepository();
    const listSpy = vi.spyOn(repository, 'listCommentQueue');
    const service = createModerationService(repository);

    await service.listCommentQueue({ status: 'all', limit: 20 });

    expect(listSpy).toHaveBeenCalledWith({ status: 'all', cursor: undefined, limit: 20 });
  });

  it('rejects a malformed cursor rather than passing it through', async () => {
    const { repository } = createFakeRepository();
    const service = createModerationService(repository);

    await expect(service.listCommentQueue({ status: 'all', cursor: 'not-base64-json', limit: 20 })).rejects.toMatchObject({
      status: 400,
      code: 'invalid_cursor',
    });
  });

  it('passes the reported filter through to the repository', async () => {
    const { repository } = createFakeRepository();
    const listSpy = vi.spyOn(repository, 'listCommentQueue');
    const service = createModerationService(repository);

    await service.listCommentQueue({ status: 'reported', limit: 20 });

    expect(listSpy).toHaveBeenCalledWith({ status: 'reported', cursor: undefined, limit: 20 });
  });
});

describe('ModerationService — the reader list passes search and status through', () => {
  it('forwards search and status to the repository', async () => {
    const { repository } = createFakeRepository();
    const listSpy = vi.spyOn(repository, 'listReaders');
    const service = createModerationService(repository);

    await service.listReaders({ search: 'rina', status: 'banned', limit: 20, offset: 0 });

    expect(listSpy).toHaveBeenCalledWith({ search: 'rina', status: 'banned', limit: 20, offset: 0 });
  });
});

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a createdAt and id', () => {
    const source = { createdAt: new Date('2026-08-17T04:00:00.000Z'), id: 'row-1' };
    expect(decodeCursor(encodeCursor(source))).toEqual(source);
  });

  it('rejects a cursor that is not valid base64url JSON', () => {
    expect(() => decodeCursor('!!not valid!!')).toThrow(AppError);
  });

  it('rejects a cursor missing its id field', () => {
    const malformed = Buffer.from(JSON.stringify({ createdAt: '2026-08-17T00:00:00.000Z' })).toString('base64url');
    expect(() => decodeCursor(malformed)).toThrow(AppError);
  });
});

describe('planReaderModeration', () => {
  const now = new Date('2026-08-17T00:00:00.000Z');

  it('produces no patch and no log entries when nothing would change', () => {
    const result = planReaderModeration({ status: 'active', mutedUntil: null }, { status: 'active' }, ACTOR, now);
    expect(result).toEqual({ patch: {}, logEntries: [] });
  });

  it('clearing an already-expired mute produces no patch and no log entry', () => {
    const expired = new Date('2026-08-01T00:00:00.000Z');
    const result = planReaderModeration({ status: 'active', mutedUntil: expired }, { mutedUntil: null }, ACTOR, now);
    expect(result).toEqual({ patch: {}, logEntries: [] });
  });

  it('re-muting with a different future duration produces a new reader_muted entry', () => {
    const currentlyMuted = new Date('2026-08-18T00:00:00.000Z');
    const result = planReaderModeration(
      { status: 'active', mutedUntil: currentlyMuted },
      { mutedUntil: '2026-08-20T00:00:00.000Z' },
      ACTOR,
      now,
    );
    expect(result.logEntries).toEqual([{ actorId: ACTOR, action: 'reader_muted', reason: null }]);
  });
});
