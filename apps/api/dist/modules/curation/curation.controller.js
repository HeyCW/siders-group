import { homeCurationReplaceRequestSchema, homeFeedQuerySchema } from '@siders/contracts';
/** Parse, delegate, respond. Admin (permission-gated) curation endpoints. */
export function createHomeCurationController(service) {
    return {
        async list(_req, res, next) {
            try {
                const entries = await service.list();
                res.json({ success: true, data: entries });
            }
            catch (err) {
                next(err);
            }
        },
        async replace(req, res, next) {
            try {
                const body = homeCurationReplaceRequestSchema.parse(req.body);
                const entries = await service.replace(body.articleIds);
                res.json({ success: true, data: entries });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
/** Parse, delegate, respond. Public (unauthenticated) homepage feed endpoint. */
export function createHomeFeedController(service) {
    return {
        async getFeed(req, res, next) {
            try {
                const query = homeFeedQuerySchema.parse(req.query);
                const feed = await service.getFeed(query.limit);
                res.json({ success: true, data: feed });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
