import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { sessionMetaFromRequest, type SessionMetaEnv } from './sessionMeta.js';

const env: SessionMetaEnv = { SESSION_SECRET: 'a'.repeat(32) };

function makeReq(opts: { ip?: string; userAgent?: string }): Request {
  return {
    ip: opts.ip,
    get: (name: string) => (name.toLowerCase() === 'user-agent' ? opts.userAgent : undefined),
  } as unknown as Request;
}

describe('sessionMetaFromRequest', () => {
  it('never returns the address in the clear', () => {
    const meta = sessionMetaFromRequest(makeReq({ ip: '203.0.113.7' }), env);
    expect(meta.ipHash).toBeDefined();
    expect(meta.ipHash).not.toContain('203.0.113.7');
    expect(meta.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for one address and distinct across addresses', () => {
    const first = sessionMetaFromRequest(makeReq({ ip: '203.0.113.7' }), env);
    const same = sessionMetaFromRequest(makeReq({ ip: '203.0.113.7' }), env);
    const other = sessionMetaFromRequest(makeReq({ ip: '203.0.113.8' }), env);

    expect(first.ipHash).toBe(same.ipHash);
    expect(first.ipHash).not.toBe(other.ipHash);
  });

  it('is keyed on the secret, so the digest is not reversible by exhausting the address space', () => {
    const withOurSecret = sessionMetaFromRequest(makeReq({ ip: '203.0.113.7' }), env);
    const withAnother = sessionMetaFromRequest(makeReq({ ip: '203.0.113.7' }), { SESSION_SECRET: 'b'.repeat(32) });

    expect(withOurSecret.ipHash).not.toBe(withAnother.ipHash);
  });

  it('carries the user agent through and tolerates a missing address', () => {
    const meta = sessionMetaFromRequest(makeReq({ userAgent: 'Mozilla/5.0' }), env);
    expect(meta).toEqual({ userAgent: 'Mozilla/5.0', ipHash: undefined });
  });
});
