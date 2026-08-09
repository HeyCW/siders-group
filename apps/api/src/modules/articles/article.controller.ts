import type { NextFunction, Request, Response } from 'express';
import {
  articleAutosaveRequestSchema,
  articleCreateRequestSchema,
  articlePublicListQuerySchema,
  articleScheduleRequestSchema,
  articleStatusSchema,
  articleUpdateRequestSchema,
} from '@siders/contracts';
import type { ArticleService } from './article.service.js';
import type { ArticleRepository } from './article.repository.js';
import { toAdminResponse, toPreviewResponse, toPublicCard, toPublicDetail } from './article.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import type { Env } from '../../config/env.js';

type MediaUrlEnv = Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>;

function requireCaller(req: Request): { subjectId: string } {
  const subjectId = req.auth?.subjectId;
  if (!subjectId) throw new AppError('Not authenticated', 401, 'unauthenticated');
  return { subjectId };
}

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(`Missing path parameter: ${name}`, 400, 'bad_request');
  return value;
}

/** Parse, delegate, respond. Admin (permission-gated) article endpoints. */
export function createArticleController(service: ArticleService, env: MediaUrlEnv) {
  return {
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const body = articleCreateRequestSchema.parse(req.body);
        const caller = requireCaller(req);
        const article = await service.create(body, caller.subjectId);
        res.status(201).json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const article = await service.get(id);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const status = req.query.status !== undefined ? articleStatusSchema.parse(req.query.status) : undefined;
        const articles = await service.list(status);
        res.json({ success: true, data: articles.map((article) => toAdminResponse(env, article)) });
      } catch (err) {
        next(err);
      }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const body = articleUpdateRequestSchema.parse(req.body);
        const article = await service.update(id, body);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async autosave(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const body = articleAutosaveRequestSchema.parse(req.body);
        const article = await service.autosave(id, body);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        await service.delete(id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const article = await service.publish(id);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async unpublish(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const article = await service.unpublish(id);
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async schedule(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const body = articleScheduleRequestSchema.parse(req.body);
        const article = await service.schedule(id, new Date(body.publishedAt));
        res.json({ success: true, data: toAdminResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },

    async preview(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const id = requireParam(req, 'id');
        const article = await service.preview(id);
        res.json({ success: true, data: toPreviewResponse(env, article) });
      } catch (err) {
        next(err);
      }
    },
  };
}

/** Parse, delegate, respond. Public (unauthenticated) article endpoints. */
export function createPublicArticleController(repository: ArticleRepository, env: MediaUrlEnv) {
  return {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const query = articlePublicListQuerySchema.parse(req.query);
        const articles = await repository.listPublished({ ...query, now: new Date() });
        res.json({ success: true, data: articles.map((article) => toPublicCard(env, article)) });
      } catch (err) {
        next(err);
      }
    },

    async getBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const slug = requireParam(req, 'slug');
        const article = await repository.findPublishedBySlug(slug, new Date());
        if (!article) throw new AppError('Article not found', 404, 'not_found');
        res.json({ success: true, data: toPublicDetail(env, article) });
      } catch (err) {
        next(err);
      }
    },
  };
}
