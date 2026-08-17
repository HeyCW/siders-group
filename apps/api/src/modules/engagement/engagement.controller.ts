import type { NextFunction, Request, Response } from 'express';
import { commentCreateRequestSchema, commentListQuerySchema } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { hmacSha256Hex } from '../../lib/hashCompare.js';
import { clientIp } from '../../middleware/rateLimit.js';
import { requireUuidParam } from '../../lib/requireParam.js';
import type { EngagementService } from './engagement.service.js';

export interface EngagementControllerEnv {
  SESSION_SECRET: string;
}

/**
 * The reader acting on this request. `requireReader` has already rejected anyone who is not an
 * active reader by the time a reader-gated handler runs, so a missing `req.auth` here would mean
 * the route was mounted without its guard — a wiring bug, not a caller error, and worth failing
 * loudly rather than silently attributing the write to nobody.
 */
function requireReaderId(req: Request): string {
  const subjectId = req.auth?.subjectType === 'reader' ? req.auth.subjectId : undefined;
  if (!subjectId) throw new AppError('Reader session required', 401, 'unauthenticated');
  return subjectId;
}

/** The caller's reader id when they have one, `undefined` otherwise — for the public summary,
 *  where an anonymous caller is ordinary rather than an error. */
function optionalReaderId(req: Request): string | undefined {
  return req.auth?.subjectType === 'reader' ? req.auth.subjectId : undefined;
}

/** Parse, delegate, respond. Public and reader-gated engagement endpoints for one article. */
export function createEngagementController(service: EngagementService, env: EngagementControllerEnv) {
  return {
    async recordView(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const articleId = requireUuidParam(req, 'id');
        // Keyed, never the raw address — an IPv4 is only 2^32 candidates, so a plain digest of
        // one is pseudonymous in name only (`lib/sessionMeta.ts` sets this precedent for
        // `sessions.ip_hash`).
        const visitorHash = hmacSha256Hex(clientIp(req), env.SESSION_SECRET);
        await service.recordView(articleId, visitorHash);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const articleId = requireUuidParam(req, 'id');
        const data = await service.getSummary(articleId, optionalReaderId(req));
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },

    async toggleLike(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const articleId = requireUuidParam(req, 'id');
        const data = await service.toggleLike(articleId, requireReaderId(req));
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },

    async listComments(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const articleId = requireUuidParam(req, 'id');
        const { limit, offset } = commentListQuerySchema.parse(req.query);
        const data = await service.listComments(articleId, limit, offset);
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },

    async createComment(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const articleId = requireUuidParam(req, 'id');
        const { body } = commentCreateRequestSchema.parse(req.body);
        const data = await service.createComment(articleId, requireReaderId(req), body);
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    },
  };
}
