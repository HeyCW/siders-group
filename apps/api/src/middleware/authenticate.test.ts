import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createAuthenticate, type AuthenticateEnv } from './authenticate.js';
import { signAccessToken } from '../lib/tokens.js';

function makeEnv(): AuthenticateEnv {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    ACCESS_TOKEN_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ACCESS_TOKEN_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function makeReq(cookieValue?: string): Request {
  return { cookies: cookieValue !== undefined ? { sid_at: cookieValue } : {} } as unknown as Request;
}

describe('authenticate', () => {
  it('never rejects — an anonymous request calls next() with no error', async () => {
    const authenticate = createAuthenticate(makeEnv());
    const req = makeReq();
    const next = vi.fn();
    await authenticate(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeUndefined();
  });

  it('populates req.auth for a valid credential and calls next() with no error', async () => {
    const env = makeEnv();
    const authenticate = createAuthenticate(env);
    const token = await signAccessToken(
      { subjectId: 'staff-1', subjectType: 'staff', sessionId: 'session-1' },
      env,
    );
    const req = makeReq(token);
    const next = vi.fn();
    await authenticate(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ subjectId: 'staff-1', subjectType: 'staff', sessionId: 'session-1' });
  });

  it('treats an invalid credential as anonymous rather than rejecting', async () => {
    const authenticate = createAuthenticate(makeEnv());
    const req = makeReq('not-a-real-token');
    const next = vi.fn();
    await authenticate(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeUndefined();
  });

  it('treats an expired credential as anonymous rather than rejecting', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const env: AuthenticateEnv = {
      ACCESS_TOKEN_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      ACCESS_TOKEN_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
    const { SignJWT, importPKCS8 } = await import('jose');
    const key = await importPKCS8(env.ACCESS_TOKEN_PRIVATE_KEY, 'EdDSA');
    const expiredToken = await new SignJWT({ type: 'staff', sid: 'session-1' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('staff-1')
      .setIssuer('siders-api')
      .setAudience('siders')
      .setIssuedAt(0)
      .setExpirationTime(1) // 1970, already expired
      .sign(key);

    const authenticate = createAuthenticate(env);
    const req = makeReq(expiredToken);
    const next = vi.fn();
    await authenticate(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeUndefined();
  });
});
