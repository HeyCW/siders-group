import { commentModerateRequestSchema, commentQueueQuerySchema, commentReportRequestSchema, commentReportsDismissRequestSchema, readerModerateRequestSchema, readerQueueQuerySchema, } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { requireUuidParam } from '../../lib/requireParam.js';
/**
 * The acting staff member. Every staff route here declares `requirePermission('moderation.manage')`,
 * which rejects before the handler runs unless `req.auth.subjectType === 'staff'` — so a missing
 * subject here means the route was mounted without its guard, a wiring bug worth failing loudly
 * on rather than silently attributing the action to nobody.
 */
function requireActorId(req) {
    const subjectId = req.auth?.subjectType === 'staff' ? req.auth.subjectId : undefined;
    if (!subjectId)
        throw new AppError('Staff session required', 403, 'forbidden');
    return subjectId;
}
/** The reporting reader. `reportComment` declares `requireReader({ createsContent: false })`,
 *  which rejects before this runs unless `req.auth.subjectType === 'reader'`. */
function requireReporterId(req) {
    const subjectId = req.auth?.subjectType === 'reader' ? req.auth.subjectId : undefined;
    if (!subjectId)
        throw new AppError('Reader session required', 401, 'unauthenticated');
    return subjectId;
}
/** Parse, delegate, respond. Staff moderation endpoints are permission-gated; `reportComment` is
 *  reader-gated instead — see `moderation.routes.ts` for exactly which is which. */
export function createModerationController(service) {
    return {
        async listCommentQueue(req, res, next) {
            try {
                const query = commentQueueQuerySchema.parse(req.query);
                const data = await service.listCommentQueue(query);
                res.json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
        async moderateComment(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = commentModerateRequestSchema.parse(req.body);
                const data = await service.moderateComment(id, body, requireActorId(req));
                res.json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
        async dismissCommentReports(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = commentReportsDismissRequestSchema.parse(req.body);
                const data = await service.dismissCommentReports(id, body.reason, requireActorId(req));
                res.json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
        async reportComment(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = commentReportRequestSchema.parse(req.body);
                const data = await service.fileReport(id, requireReporterId(req), body.reason, body.note);
                res.status(201).json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
        async listReaders(req, res, next) {
            try {
                const query = readerQueueQuerySchema.parse(req.query);
                const data = await service.listReaders(query);
                res.json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
        async moderateReader(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = readerModerateRequestSchema.parse(req.body);
                const data = await service.moderateReader(id, body, requireActorId(req), new Date());
                res.json({ success: true, data });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
