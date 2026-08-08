import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** The only place that formats an error response (architecture.md §4). */
export function createErrorHandler(logger: Logger) {
  return function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof AppError) {
      logger.warn({ err, requestId: req.requestId }, err.message);
      res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
      return;
    }

    // Controllers call `schema.parse(req.body)` and hand the throw straight to `next`. Without
    // this branch every rejected payload — a caller-supplied `password`, an off-catalog
    // permission, an `isSystem` marker — surfaces as a 500, reporting a server fault for what
    // is squarely a client error. Mapped here rather than per-route so a new controller cannot
    // forget it (CLAUDE.md - errors are "formatted once in `errorHandler`").
    if (err instanceof ZodError) {
      logger.warn({ err, requestId: req.requestId }, 'request validation failed');
      res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      });
      return;
    }

    logger.error({ err, requestId: req.requestId }, 'unhandled error');
    res.status(500).json({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred' },
    });
  };
}
