import { Router } from 'express';
import type { Database } from '@siders/db';
import { createModerationRepository } from './moderation.repository.js';
import { createModerationService } from './moderation.service.js';
import { createModerationController } from './moderation.controller.js';
import { requirePermission, requireReader } from '../../middleware/authorize.js';
import { reportRateLimiter } from '../../middleware/rateLimit.js';

/**
 * The comment moderation queue, mounted at `/admin/comments`; the reader moderation list, mounted
 * at `/admin/readers`; and the reader-facing report endpoint, mounted at `/comments` — three
 * mount paths for one module, matching every other module in this codebase that names each of
 * its full paths explicitly in `server.ts` rather than sharing a combined prefix.
 *
 * The staff routes declare `requirePermission('moderation.manage')` — one permission for both
 * halves of the staff-facing capability, since reviewing a comment and deciding whether the
 * reader behind it should be muted or banned are the same staff task, not two (design.md -
 * Decision 2). Filing a report is a reader action, not a staff one, and is excluded from that
 * permission entirely (specs/community-moderation/spec.md - "A reader can report a comment") —
 * it declares `requireReader({ createsContent: false })` instead, so neither a mute nor a ban
 * blocks it (design.md - Decision 8).
 */
function moderationDependencies(db: Database) {
  const repository = createModerationRepository(db);
  const service = createModerationService(repository);
  return createModerationController(service);
}

export function commentModerationRoutes(db: Database) {
  const router = Router();
  const controller = moderationDependencies(db);

  router.get('/', requirePermission('moderation.manage'), controller.listCommentQueue);
  router.patch('/:id', requirePermission('moderation.manage'), controller.moderateComment);
  // Declared after `/:id` even though it is a distinct, longer path — Express matches by pattern
  // specificity here regardless of declaration order for non-overlapping shapes, but the order
  // states explicitly which path wins when two could be read as ambiguous.
  router.patch('/:id/reports/dismiss', requirePermission('moderation.manage'), controller.dismissCommentReports);

  return router;
}

export function readerModerationRoutes(db: Database) {
  const router = Router();
  const controller = moderationDependencies(db);

  router.get('/', requirePermission('moderation.manage'), controller.listReaders);
  router.patch('/:id', requirePermission('moderation.manage'), controller.moderateReader);

  return router;
}

/**
 * `POST /comments/:id/report`. `createsContent: false` — a report publishes nothing another
 * reader ever sees, so neither a mute nor a ban restricts filing one, the same reasoning
 * `article-engagement`'s "a like publishes no reader-authored text" already established for likes
 * (design.md - Decision 8).
 */
export function commentReportRoutes(db: Database) {
  const router = Router();
  const controller = moderationDependencies(db);

  router.post('/:id/report', requireReader({ createsContent: false }), reportRateLimiter(), controller.reportComment);

  return router;
}
