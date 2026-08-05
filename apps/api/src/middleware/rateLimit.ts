import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Placeholder per-route bucket limiter. Fleshed out (Redis- or memory-backed)
 * by whichever feature change first needs enforced limits.
 */
export function rateLimit(_options: RateLimitOptions) {
  return function rateLimitMiddleware(_req: Request, _res: Response, next: NextFunction): void {
    next();
  };
}
