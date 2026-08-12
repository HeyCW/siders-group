import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { __resetRateLimitStoreForTests, rateLimit, respondWithTooManyRequests } from './rateLimit.js';

function makeReq(): Request {
  return {} as Request;
}

/**
 * `failuresOnly` refunds on the response's `finish` event, so those tests need a response that
 * can actually emit one. `finish()` stands in for the handler completing with `statusCode`.
 */
function makeRes(): Response & { finish(statusCode: number): void } {
  const emitter = new EventEmitter();
  const res = emitter as unknown as Response & { finish(statusCode: number): void };
  res.finish = (statusCode: number) => {
    (res as unknown as { statusCode: number }).statusCode = statusCode;
    emitter.emit('finish');
  };
  return res;
}

describe('rateLimit', () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests();
  });

  it('allows requests under the limit', () => {
    const middleware = rateLimit({
      name: 'test',
      windowMs: 1000,
      max: 3,
      keyGenerator: () => 'fixed-key',
      onLimited: respondWithTooManyRequests,
    });
    const next = vi.fn();
    for (let i = 0; i < 3; i += 1) {
      middleware(makeReq(), {} as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(3);
    expect(next).toHaveBeenNthCalledWith(3);
  });

  it('rejects once the limit is exceeded', () => {
    const middleware = rateLimit({
      name: 'test',
      windowMs: 1000,
      max: 2,
      keyGenerator: () => 'fixed-key',
      onLimited: respondWithTooManyRequests,
    });
    const next = vi.fn();
    middleware(makeReq(), {} as Response, next as NextFunction);
    middleware(makeReq(), {} as Response, next as NextFunction);
    middleware(makeReq(), {} as Response, next as NextFunction);
    expect(next).toHaveBeenNthCalledWith(3, expect.objectContaining({ status: 429 }));
  });

  it('tracks separate keys independently', () => {
    const middleware = rateLimit({
      name: 'test',
      windowMs: 1000,
      max: 1,
      keyGenerator: (req) => (req as unknown as { key: string }).key,
      onLimited: respondWithTooManyRequests,
    });
    const next = vi.fn();
    middleware({ key: 'a' } as unknown as Request, {} as Response, next as NextFunction);
    middleware({ key: 'b' } as unknown as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
  });

  it('calls a custom onLimited handler instead of the default 429', () => {
    const onLimited = vi.fn();
    const middleware = rateLimit({ name: 'test', windowMs: 1000, max: 1, keyGenerator: () => 'fixed-key', onLimited });
    const next = vi.fn();
    middleware(makeReq(), {} as Response, next as NextFunction);
    middleware(makeReq(), {} as Response, next as NextFunction);
    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));
  });

  /**
   * Every limiter shares one process-wide bucket map. Before the key was namespaced by
   * `name`, two limiters whose key generators returned the same string shared a counter — the
   * media-upload limiter and the password-change limiter both keyed on a bare `subjectId`, so
   * uploading images spent the password-change budget and the next *correct* password was
   * answered "Current password is incorrect". Four `clientIp`-keyed limiters collided the same
   * way, letting anonymous public reads exhaust the refresh budget and sign an admin out.
   */
  it('keeps two limiters independent when their key generators return the same string', () => {
    const uploadLimited = vi.fn();
    const passwordLimited = vi.fn();
    const sameKey = () => 'subject-1';

    const uploads = rateLimit({
      name: 'media-upload',
      windowMs: 1000,
      max: 30,
      keyGenerator: sameKey,
      onLimited: uploadLimited,
    });
    const passwordChanges = rateLimit({
      name: 'staff-password-change',
      windowMs: 1000,
      max: 10,
      keyGenerator: sameKey,
      onLimited: passwordLimited,
    });

    // Spend the *upload* budget well past the password limiter's smaller ceiling.
    for (let i = 0; i < 20; i += 1) {
      uploads(makeReq(), {} as Response, vi.fn() as NextFunction);
    }

    // The password limiter must still have its full, untouched budget.
    for (let i = 0; i < 10; i += 1) {
      passwordChanges(makeReq(), {} as Response, vi.fn() as NextFunction);
    }

    expect(uploadLimited).not.toHaveBeenCalled();
    expect(passwordLimited).not.toHaveBeenCalled();

    // ...and enforce its own ceiling on the 11th.
    passwordChanges(makeReq(), {} as Response, vi.fn() as NextFunction);
    expect(passwordLimited).toHaveBeenCalledTimes(1);
  });

  describe('failuresOnly', () => {
    it('refunds a successful attempt so it does not spend the budget', () => {
      const onLimited = vi.fn();
      const middleware = rateLimit({
        name: 'test',
        windowMs: 1000,
        max: 2,
        keyGenerator: () => 'fixed-key',
        onLimited,
        failuresOnly: true,
      });

      for (let i = 0; i < 5; i += 1) {
        const res = makeRes();
        middleware(makeReq(), res, vi.fn() as NextFunction);
        res.finish(204);
      }

      expect(onLimited).not.toHaveBeenCalled();
    });

    it('charges a failed attempt', () => {
      const onLimited = vi.fn();
      const middleware = rateLimit({
        name: 'test',
        windowMs: 1000,
        max: 2,
        keyGenerator: () => 'fixed-key',
        onLimited,
        failuresOnly: true,
      });

      for (let i = 0; i < 2; i += 1) {
        const res = makeRes();
        middleware(makeReq(), res, vi.fn() as NextFunction);
        res.finish(401);
      }
      middleware(makeReq(), makeRes(), vi.fn() as NextFunction);

      expect(onLimited).toHaveBeenCalledTimes(1);
    });

    /**
     * The regression this middleware existed to have and didn't: the ceiling was read at
     * request entry but only written in `finish`, so requests issued in parallel all observed
     * the pre-increment count and all passed. Sequential tests could never catch it — the
     * reporter measured 12/12 concurrent attempts verified against a max of 5.
     */
    it('holds the ceiling when attempts are made concurrently, not just sequentially', () => {
      const onLimited = vi.fn();
      const middleware = rateLimit({
        name: 'test',
        windowMs: 1000,
        max: 5,
        keyGenerator: () => 'fixed-key',
        onLimited,
        failuresOnly: true,
      });

      // All 12 enter before any response finishes — the shape of a parallel credential-stuffing
      // burst, and the shape the old check-then-increment ordering let through wholesale.
      const inFlight = Array.from({ length: 12 }, () => {
        const res = makeRes();
        const next = vi.fn();
        middleware(makeReq(), res, next as NextFunction);
        return { res, next };
      });

      const admitted = inFlight.filter(({ next }) => next.mock.calls.length > 0);
      expect(admitted).toHaveLength(5);
      expect(onLimited).toHaveBeenCalledTimes(7);

      for (const { res } of admitted) res.finish(401);
    });

    it('drops a refund whose window rolled over rather than crediting an orphaned bucket', () => {
      const onLimited = vi.fn();
      const middleware = rateLimit({
        name: 'test',
        windowMs: 20,
        max: 1,
        keyGenerator: () => 'fixed-key',
        onLimited,
        failuresOnly: true,
      });

      const stale = makeRes();
      middleware(makeReq(), stale, vi.fn() as NextFunction);

      // The window elapses while that first request is still in flight, so the next request
      // opens a fresh bucket. The late refund must not land anywhere.
      vi.useFakeTimers();
      try {
        vi.setSystemTime(Date.now() + 100);
        middleware(makeReq(), makeRes(), vi.fn() as NextFunction);
        stale.finish(204);
        // The fresh bucket's single slot is spent, so this is refused. Had the stale refund
        // been credited to it, this would have been admitted instead.
        middleware(makeReq(), makeRes(), vi.fn() as NextFunction);
      } finally {
        vi.useRealTimers();
      }

      expect(onLimited).toHaveBeenCalledTimes(1);
    });
  });
});
