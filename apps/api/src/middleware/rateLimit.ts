import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';

export interface RateLimitOptions {
  /**
   * Namespace for this limiter's buckets. Required, not optional: every limiter shares the one
   * process-wide `buckets` map, so without a namespace two limiters whose key generators return
   * the same string share a counter and silently enforce each other's ceilings. That was not
   * hypothetical — the media-upload limiter and the password-change limiter both keyed on a bare
   * `subjectId`, so 10 image uploads exhausted the password-change budget and the next *correct*
   * password came back as "Current password is incorrect"; and four `clientIp`-keyed limiters
   * (public reads, staff login, refresh, Google callback) all shared one bucket per IP, letting
   * anonymous reads sign an admin out by exhausting the refresh budget. A required field makes
   * that class of collision impossible to reintroduce by omission.
   */
  name: string;
  windowMs: number;
  max: number;
  /** Derives the bucket key from the request — e.g. `${ip}:${email}`, or `ip` alone. */
  keyGenerator: (req: Request) => string;
  /**
   * Called instead of a 429 when the limit is exceeded, to make the throttled response
   * indistinguishable from this endpoint's own ordinary failure response
   * (specs/authentication/spec.md - "Throttling does not leak account existence").
   *
   * Required, not optional: the spec's indistinguishability rule is per endpoint, so there is
   * no correct default a limiter could fall back to — a 429 is distinguishable from every
   * ordinary failure by construction. Four of the five rate-limited endpoints originally
   * omitted this, which is what an optional field invites. A limiter that genuinely wants the
   * generic 429 says so with `respondWithTooManyRequests`.
   */
  onLimited: (req: Request, res: Response, next: NextFunction) => void;
  /**
   * Charge only attempts whose response fails (status >= 400). The specs limit *failed*
   * sign-in attempts and *invalid* token submissions (specs/authentication/spec.md -
   * "Authentication attempts are rate limited"); counting successes as well would lock out a
   * staff member who legitimately signs in from several devices inside one window.
   *
   * Implemented as reserve-then-refund rather than count-on-failure, so the ceiling still
   * holds against concurrent attempts — see the note in the middleware below.
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

    // Namespaced so each limiter counts only its own traffic — see `name` above.
    const key = `${options.name}:${options.keyGenerator(req)}`;
    const bucket = currentBucket(key, now, options.windowMs);

    // Reserve the slot *before* the handler runs, and hand it back afterward if the attempt
    // turned out not to be chargeable. Checking the ceiling at entry while only incrementing in
    // `finish` bounds nothing under concurrency: N requests issued in parallel all read the
    // pre-increment count and all pass, so `max` caps sequential attempts only. Attackers do not
    // attack sequentially.
    bucket.count += 1;
    if (bucket.count > options.max) {
      options.onLimited(req, res, next);
      return;
    }

    if (options.failuresOnly) {
      res.on('finish', () => {
        if (res.statusCode >= FAILURE_STATUS_FLOOR) return;
        // A success costs nothing, so refund — but only into the same bucket we charged. The
        // window may have rolled over while the handler ran, in which case `currentBucket`
        // has already replaced this key's bucket and crediting the captured object would
        // write to an orphan (and crediting the new one would refund a slot never charged
        // there). Dropping the refund is the safe end of that race: it can only leave the
        // caller marginally more limited, never less.
        if (buckets.get(key) === bucket) bucket.count -= 1;
      });
    }

    next();
  };
}

/**
 * The explicit opt-in to a distinguishable 429, for limiters whose endpoint has no ordinary
 * failure response to blend into. Spelling it out keeps the choice visible at the call site
 * rather than implied by an omitted option.
 */
export function respondWithTooManyRequests(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Too many requests', 429, 'rate_limited'));
}

/** Test-only: clears every tracked bucket so tests don't leak state into each other. */
export function __resetRateLimitStoreForTests(): void {
  buckets.clear();
}

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

const PUBLIC_READ_RATE_LIMIT = { windowMs: 60 * 1000, max: 120 };

/**
 * Shared config for every public, unauthenticated read endpoint (articles, curation/home feed,
 * reels, …) — window and ceiling in common, namespaced per caller via `name` so each endpoint
 * still counts only its own traffic (see `name` above). Previously redefined verbatim in
 * `article.routes.ts`, `curation.routes.ts`, and `reels.routes.ts`; consolidated here so the
 * window/max and the 429 response shape have one definition instead of three.
 */
export function publicReadRateLimiter(name: string) {
  return rateLimit({
    name,
    ...PUBLIC_READ_RATE_LIMIT,
    keyGenerator: clientIp,
    onLimited: (_req, res) => {
      res.status(429).json({ success: false, error: { code: 'rate_limited', message: 'Too many requests' } });
    },
  });
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The reader-engagement write budgets from `docs/ARCHITECTURE.md` §9.3 — views 60/hour, likes
 * 60/hour, comments 10/hour. Each gets its own `name`, so exhausting one never spends another
 * (specs/article-engagement/spec.md - "Exhausting one budget does not exhaust another"); see the
 * `name` option above for the two live bugs a shared namespace has already caused here.
 */
const ENGAGEMENT_RATE_LIMITS = {
  view: { name: 'engagement-view', windowMs: HOUR_MS, max: 60 },
  like: { name: 'engagement-like', windowMs: HOUR_MS, max: 60 },
  comment: { name: 'engagement-comment', windowMs: HOUR_MS, max: 10 },
  // Not one of the four §9.3 originally listed (comments, likes, views, login, contact) — added
  // by `add-community-moderation` alongside the report feature itself, in its own namespace
  // rather than reused, for the same reason every entry above already has one (design.md -
  // Decision 8, `openspec/changes/add-community-moderation`).
  report: { name: 'engagement-report', windowMs: HOUR_MS, max: 20 },
} as const;

/**
 * The caller's reader id, for the two reader-gated engagement limiters. Keying on the reader
 * rather than the address is what keeps a shared office or campus address from collapsing every
 * reader behind it into one comment budget (specs/article-engagement/spec.md - "Readers behind
 * one address have separate comment budgets").
 *
 * Falls back to the address only if `req.auth` is somehow absent. These limiters are always
 * declared after `requireReader`, which rejects an anonymous caller before this runs, so the
 * fallback is unreachable in practice — it exists so a future misordering degrades to
 * IP-limiting rather than dropping every anonymous caller into one shared `'unknown'` bucket.
 */
function readerKey(req: Request): string {
  return req.auth?.subjectId ?? clientIp(req);
}

function engagementLimiter(config: { name: string; windowMs: number; max: number }, keyGenerator: (req: Request) => string) {
  return rateLimit({
    ...config,
    keyGenerator,
    onLimited: (_req, res) => {
      res.status(429).json({ success: false, error: { code: 'rate_limited', message: 'Too many requests' } });
    },
  });
}

/** 60/hour per client address — `docs/ARCHITECTURE.md` §9.3. */
export function viewRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.view, clientIp);
}

/** 60/hour per reader — `docs/ARCHITECTURE.md` §9.3. */
export function likeRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.like, readerKey);
}

/** 10/hour per reader — `docs/ARCHITECTURE.md` §9.3. */
export function commentRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.comment, readerKey);
}

/** 20/hour per reader — design.md - Decision 8, `openspec/changes/add-community-moderation`. */
export function reportRateLimiter() {
  return engagementLimiter(ENGAGEMENT_RATE_LIMITS.report, readerKey);
}
