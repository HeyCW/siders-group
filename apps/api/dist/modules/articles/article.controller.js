import { articleAutosaveRequestSchema, articleCreateRequestSchema, articlePublicListQuerySchema, articleScheduleRequestSchema, articleStatusSchema, articleUpdateRequestSchema, } from '@siders/contracts';
import { toAdminResponse, toPreviewResponse, toPublicCard, toPublicDetail } from './article.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import { requireParam, requireUuidParam } from '../../lib/requireParam.js';
function requireCaller(req) {
    const subjectId = req.auth?.subjectId;
    if (!subjectId)
        throw new AppError('Not authenticated', 401, 'unauthenticated');
    return { subjectId };
}
/** Parse, delegate, respond. Admin (permission-gated) article endpoints. */
export function createArticleController(service, env) {
    return {
        async create(req, res, next) {
            try {
                const body = articleCreateRequestSchema.parse(req.body);
                const caller = requireCaller(req);
                const article = await service.create(body, caller.subjectId);
                res.status(201).json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async get(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const article = await service.get(id);
                res.json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async list(req, res, next) {
            try {
                const status = req.query.status !== undefined ? articleStatusSchema.parse(req.query.status) : undefined;
                const articles = await service.list(status);
                res.json({ success: true, data: articles.map((article) => toAdminResponse(env, article)) });
            }
            catch (err) {
                next(err);
            }
        },
        async update(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = articleUpdateRequestSchema.parse(req.body);
                const article = await service.update(id, body);
                res.json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async autosave(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = articleAutosaveRequestSchema.parse(req.body);
                const article = await service.autosave(id, body);
                res.json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async remove(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                await service.delete(id);
                res.status(204).end();
            }
            catch (err) {
                next(err);
            }
        },
        async publish(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const article = await service.publish(id);
                res.json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async unpublish(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const article = await service.unpublish(id);
                res.json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async schedule(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = articleScheduleRequestSchema.parse(req.body);
                const article = await service.schedule(id, new Date(body.publishedAt));
                res.json({ success: true, data: toAdminResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
        async preview(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const article = await service.preview(id);
                res.json({ success: true, data: toPreviewResponse(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
/** Parse, delegate, respond. Public (unauthenticated) article endpoints. */
export function createPublicArticleController(repository, env) {
    return {
        async list(req, res, next) {
            try {
                const query = articlePublicListQuerySchema.parse(req.query);
                const articles = await repository.listPublished({ ...query, now: new Date() });
                res.json({ success: true, data: articles.map((article) => toPublicCard(env, article)) });
            }
            catch (err) {
                next(err);
            }
        },
        async getBySlug(req, res, next) {
            try {
                const slug = requireParam(req, 'slug');
                const article = await repository.findPublishedBySlug(slug, new Date());
                if (!article)
                    throw new AppError('Article not found', 404, 'not_found');
                res.json({ success: true, data: toPublicDetail(env, article) });
            }
            catch (err) {
                next(err);
            }
        },
    };
}
