import type {
  CommentModerateRequest,
  CommentQueueQuery,
  CommentQueueResponse,
  CommentQueueRow,
  CommentReportReason,
  CommentReportResponse,
  ModerationAction,
  ReaderModerateRequest,
  ReaderQueueQuery,
  ReaderQueueResponse,
  ReaderQueueRow,
} from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { isUniqueViolation } from '../../lib/pgErrors.js';
import { toCommentQueueRow, toCommentReportResponse, toReaderQueueRow } from './moderation.mapper.js';
import type { ModerationActionInput, ModerationRepository, ReaderModerationStatus } from './moderation.repository.js';

export interface ModerationService {
  listCommentQueue(query: CommentQueueQuery): Promise<CommentQueueResponse>;
  moderateComment(id: string, request: CommentModerateRequest, actorId: string): Promise<CommentQueueRow>;
  dismissCommentReports(id: string, reason: string | undefined, actorId: string): Promise<CommentQueueRow>;
  fileReport(
    commentId: string,
    reporterId: string,
    reason: CommentReportReason,
    note: string | undefined,
  ): Promise<CommentReportResponse>;
  listReaders(query: ReaderQueueQuery): Promise<ReaderQueueResponse>;
  moderateReader(id: string, request: ReaderModerateRequest, actorId: string, now: Date): Promise<ReaderQueueRow>;
}

function commentNotFoundError(): AppError {
  return new AppError('Comment not found', 404, 'not_found');
}

function readerNotFoundError(): AppError {
  return new AppError('Reader not found', 404, 'not_found');
}

/** 404 rather than "nothing to do" — from the caller's perspective, dismissing a comment with no
 *  open reports and dismissing a comment that does not exist are the same observable failure:
 *  there is no open report at this id to act on (tasks.md - 3.4, "404 for an unknown id or one
 *  with no open reports to dismiss"). */
function noOpenReportsError(): AppError {
  return new AppError('This comment has no open reports to dismiss', 404, 'not_found');
}

function alreadyReportedError(): AppError {
  return new AppError('You have already reported this comment', 409, 'already_reported');
}

/**
 * The cursor is opaque to the caller by contract (`packages/contracts/src/moderation.ts`) and
 * to the query layer by construction (`moderation.repository.ts` takes an already-decoded
 * `{createdAt, id}`) — this is the one place that knows its wire format: base64url JSON of the
 * `(createdAt, id)` tuple the repository's own tie-broken ordering is built on
 * (design.md - Decision 4).
 */
export function encodeCursor(source: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: source.createdAt.toISOString(), id: source.id })).toString(
    'base64url',
  );
}

function invalidCursorError(): AppError {
  return new AppError('Invalid cursor', 400, 'invalid_cursor');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursorError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw invalidCursorError();
  }
  const { createdAt, id } = parsed as { createdAt: string; id: string };
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) throw invalidCursorError();
  return { createdAt: parsedDate, id };
}

function invalidMuteDurationError(): AppError {
  return new AppError('mutedUntil must be a future point in time', 400, 'invalid_mute_duration');
}

/**
 * The reader's mute/ban patch is one request that can name up to two independent transitions —
 * `status` (ban/unban) and `mutedUntil` (mute/unmute) — so this is the one function that knows
 * "before" well enough to say which of the up-to-six actions actually happened. Returns the
 * fields to write and the log entries to record alongside them; a field or an action is present
 * only when the request would actually change it, so re-sending a reader's current status is a
 * no-op rather than a redundant record (specs/community-moderation/spec.md names six distinct
 * reader actions, never "no-op").
 */
export function planReaderModeration(
  existing: { status: ReaderModerationStatus; mutedUntil: Date | null },
  request: ReaderModerateRequest,
  actorId: string,
  now: Date,
): { patch: { status?: ReaderModerationStatus; mutedUntil?: Date | null }; logEntries: ModerationActionInput[] } {
  const patch: { status?: ReaderModerationStatus; mutedUntil?: Date | null } = {};
  const logEntries: ModerationActionInput[] = [];
  const reason = request.reason ?? null;

  if (request.status !== undefined && request.status !== existing.status) {
    patch.status = request.status;
    const action: ModerationAction = request.status === 'banned' ? 'reader_banned' : 'reader_unbanned';
    logEntries.push({ actorId, action, reason });
  }

  if (request.mutedUntil !== undefined) {
    const requested = request.mutedUntil === null ? null : new Date(request.mutedUntil);
    if (requested !== null && requested.getTime() <= now.getTime()) throw invalidMuteDurationError();

    const currentlyMuted = existing.mutedUntil !== null && existing.mutedUntil.getTime() > now.getTime();
    const willBeMuted = requested !== null;
    const changesActiveMute =
      willBeMuted !== currentlyMuted || (willBeMuted && requested.getTime() !== existing.mutedUntil?.getTime());

    // An explicit `null` clearing an already-expired mute touches nothing: `currentlyMuted` is
    // already false, so there is no active mute to unmute, and the stale past timestamp left in
    // `readers.muted_until` is inert — `requireReader` already reads it as "not muted". Writing
    // it anyway with no corresponding action would be a state change with no record of one,
    // which is exactly what atomicity here rules out
    // (specs/community-moderation/spec.md - "The moderation record is written atomically with
    // the state change").
    if (changesActiveMute) {
      patch.mutedUntil = requested;
      const action: ModerationAction = willBeMuted ? 'reader_muted' : 'reader_unmuted';
      logEntries.push({ actorId, action, reason });
    }
  }

  return { patch, logEntries };
}

export function createModerationService(repository: ModerationRepository): ModerationService {
  return {
    async listCommentQueue(query) {
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const page = await repository.listCommentQueue({ status: query.status, cursor, limit: query.limit });
      return {
        items: page.items.map(toCommentQueueRow),
        nextCursor: page.nextCursorSource ? encodeCursor(page.nextCursorSource) : null,
      };
    },

    async moderateComment(id, request, actorId) {
      const existing = await repository.findCommentById(id);
      if (!existing) throw commentNotFoundError();

      const action: ModerationAction = request.status === 'removed' ? 'comment_removed' : 'comment_restored';
      const updated = await repository.setCommentStatus(id, request.status, {
        actorId,
        action,
        reason: request.reason ?? null,
      });
      return toCommentQueueRow(updated);
    },

    async dismissCommentReports(id, reason, actorId) {
      const existing = await repository.findCommentById(id);
      if (!existing) throw commentNotFoundError();

      const updated = await repository.dismissReports(id, actorId, {
        actorId,
        action: 'comment_reports_dismissed',
        reason: reason ?? null,
      });
      // `dismissReports` resolves to `null` when there was nothing open to dismiss — distinct
      // from "comment not found", but reported to the caller the same way: there is no open
      // report at this id to act on.
      if (!updated) throw noOpenReportsError();
      return toCommentQueueRow(updated);
    },

    async fileReport(commentId, reporterId, reason, note) {
      const existing = await repository.findCommentById(commentId);
      if (!existing) throw commentNotFoundError();

      try {
        const created = await repository.createReport(commentId, reporterId, reason, note ?? null);
        return toCommentReportResponse(created);
      } catch (err) {
        // The unique index on (comment_id, reporter_id) is what actually enforces "a reader may
        // report a given comment only once" (specs/community-moderation/spec.md) — this is the
        // constraint's violation surfacing as a typed error rather than a generic 500.
        if (isUniqueViolation(err)) throw alreadyReportedError();
        throw err;
      }
    },

    async listReaders(query) {
      const rows = await repository.listReaders({
        search: query.search,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });
      return rows.map(toReaderQueueRow);
    },

    async moderateReader(id, request, actorId, now) {
      const existing = await repository.findReaderById(id);
      if (!existing) throw readerNotFoundError();

      const { patch, logEntries } = planReaderModeration(existing, request, actorId, now);

      if (logEntries.length === 0) {
        // Nothing actually changed — e.g. re-sending the reader's current status. Reported back
        // as the current row, unchanged, rather than a no-op error: the caller asked for a state
        // that already holds.
        const row = await repository.getReaderRow(id);
        if (!row) throw readerNotFoundError();
        return toReaderQueueRow(row);
      }

      const updated = await repository.updateReader(id, patch, logEntries);
      return toReaderQueueRow(updated);
    },
  };
}
