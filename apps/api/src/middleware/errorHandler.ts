import type { NextFunction, Request, Response } from 'express';
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

    logger.error({ err, requestId: req.requestId }, 'unhandled error');
    res.status(500).json({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred' },
    });
  };
}
