import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Derives the bucket key from the request — e.g. `${ip}:${email}`, or `ip` alone. */
  keyGenerator: (req: Request) => string;
  /**
   * Called instead of the default 429 when the limit is exceeded. A route uses this to make
   * the throttled response indistinguishable from its own ordinary failure response
   * (specs/authentication/spec.md - "Throttling does not leak account existence").
   */
  onLimited?: (req: Request, res: Response, next: NextFunction) => void;
  /**
   * Count only attempts whose response fails (status >= 400), tallied once the response is
   * finished. The specs limit *failed* sign-in attempts and *invalid* token submissions
   * (specs/authentication/spec.md - "Authentication attempts are rate limited"); counting
   * successes as well would lock out a staff member who legitimately signs in from several
   * devices inside one window.
   */
  failuresOnly?: boolean;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const FAILURE_STATUS_FLOOR = 400;

/**
 * In-process counter store — correct for one API instance. `docs/ARCHITECTURE.md` §13
 * names Redis as the upgrade "once the API runs more than one instance"; this is that
 * single-instance placeholder, not a bug to fix later without noticing.
 */
const buckets = new Map<string, Bucket>();
const MAX_TRACKED_BUCKETS = 50_000;

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function currentBucket(key: string, now: number, windowMs: number): Bucket {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) return existing;
  const fresh: Bucket = { count: 0, resetAt: now + windowMs };
  buckets.set(key, fresh);
  return fresh;
}

export function rateLimit(options: RateLimitOptions) {
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    if (buckets.size > MAX_TRACKED_BUCKETS) sweepExpired(now);

    const bucket = currentBucket(options.keyGenerator(req), now, options.windowMs);

    if (bucket.count >= options.max) {
      if (options.onLimited) {
        options.onLimited(req, res, next);
      } else {
        next(new AppError('Too many requests', 429, 'rate_limited'));
      }
      return;
    }

    if (options.failuresOnly) {
      // Tallied after the handler has ruled, so a successful sign-in costs nothing.
      res.on('finish', () => {
        if (res.statusCode >= FAILURE_STATUS_FLOOR) bucket.count += 1;
      });
    } else {
      bucket.count += 1;
    }

    next();
  };
}

/** Test-only: clears every tracked bucket so tests don't leak state into each other. */
export function __resetRateLimitStoreForTests(): void {
  buckets.clear();
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
