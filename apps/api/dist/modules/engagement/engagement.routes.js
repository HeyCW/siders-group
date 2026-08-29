import { Router } from 'express';
import { requirePublic, requireReader } from '../../middleware/authorize.js';
import { commentRateLimiter, likeRateLimiter, publicReadRateLimiter, viewRateLimiter, } from '../../middleware/rateLimit.js';
import { createEngagementRepository } from './engagement.repository.js';
import { createEngagementService } from './engagement.service.js';
import { createEngagementController } from './engagement.controller.js';
/**
 * Reader engagement for one article, mounted alongside the public article routes at `/articles`.
 *
 * Sharing that mount path is unambiguous: every route below is two segments deep (`/:id/view`),
 * while `publicArticleRoutes` declares only `/` and `/:slug`. No path either router declares can
 * match a request meant for the other, whatever order they are mounted in — so this needs neither
 * a sibling mount nor a documented registration order to stay correct.
 *
 * The endpoints split three ways by declaration:
 *   - `requirePublic()`  — the summary and the comment listing; anyone may read them, and the
 *                          summary reports `likedByReader: false` rather than failing for a
 *                          caller with no session.
 *   - `requirePublic()`  — recording a view. Deliberately not reader-gated: views are an
 *                          anonymous metric, and the overwhelming majority of them are anonymous.
 *   - `requireReader()`  — liking and commenting.
 */
export function publicEngagementRoutes(db, env) {
    const router = Router();
    const repository = createEngagementRepository(db);
    const service = createEngagementService(repository);
    const controller = createEngagementController(service, env);
    router.post('/:id/view', requirePublic(), viewRateLimiter(), controller.recordView);
    router.get('/:id/engagement', requirePublic(), publicReadRateLimiter('public-engagement'), controller.getSummary);
    router.get('/:id/comments', requirePublic(), publicReadRateLimiter('public-comments'), controller.listComments);
    // `createsContent: false` overrides `requireReader`'s method-derived default. A like publishes
    // no reader-authored text, and muting is a sanction on speech — `authorize.ts` puts it as "a
    // muted reader keeps read access but is rejected at content-creating endpoints"
    // (specs/article-engagement/spec.md - "A muted reader may still like").
    router.post('/:id/like', requireReader({ createsContent: false }), likeRateLimiter(), controller.toggleLike);
    // Takes the default, so a muted reader is rejected here — which is the whole point of muting.
    router.post('/:id/comments', requireReader(), commentRateLimiter(), controller.createComment);
    return router;
}
