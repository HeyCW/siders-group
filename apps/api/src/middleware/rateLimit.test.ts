import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { __resetRateLimitStoreForTests, rateLimit } from './rateLimit.js';

function makeReq(): Request {
  return {} as Request;
}

describe('rateLimit', () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests();
  });

  it('allows requests under the limit', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 3, keyGenerator: () => 'fixed-key' });
    const next = vi.fn();
    for (let i = 0; i < 3; i += 1) {
      middleware(makeReq(), {} as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(3);
    expect(next).toHaveBeenNthCalledWith(3);
  });

  it('rejects once the limit is exceeded', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 2, keyGenerator: () => 'fixed-key' });
    const next = vi.fn();
    middleware(makeReq(), {} as Response, next as NextFunction);
    middleware(makeReq(), {} as Response, next as NextFunction);
    middleware(makeReq(), {} as Response, next as NextFunction);
    expect(next).toHaveBeenNthCalledWith(3, expect.objectContaining({ status: 429 }));
  });

  it('tracks separate keys independently', () => {
    const middleware = rateLimit({ windowMs: 1000, max: 1, keyGenerator: (req) => (req as unknown as { key: string }).key });
    const next = vi.fn();
    middleware({ key: 'a' } as unknown as Request, {} as Response, next as NextFunction);
    middleware({ key: 'b' } as unknown as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
  });

  it('calls a custom onLimited handler instead of the default 429', () => {
    const onLimited = vi.fn();
    const middleware = rateLimit({ windowMs: 1000, max: 1, keyGenerator: () => 'fixed-key', onLimited });
    const next = vi.fn();
    middleware(makeReq(), {} as Response, next as NextFunction);
    middleware(makeReq(), {} as Response, next as NextFunction);
    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ status: 429 }));
  });
});
