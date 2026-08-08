import { describe, expect, it } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import {
  assertVerifiedIdentity,
  createAuthorizationRequest,
  verifyGoogleIdToken,
  type GoogleEnv,
  type GoogleIdentity,
  type GoogleKeySet,
} from './google.js';

/** Stands in for Google's remote JWKS with the local public key these tests signed against. */
function createLocalJwks(publicKey: Awaited<ReturnType<typeof generateKeyPair>>['publicKey']): GoogleKeySet {
  return (() => Promise.resolve(publicKey)) as unknown as GoogleKeySet;
}

const env: GoogleEnv = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
};

describe('createAuthorizationRequest', () => {
  it('includes state, PKCE (S256), and nonce in the authorization URL', () => {
    const request = createAuthorizationRequest(env);
    const url = new URL(request.url);

    expect(url.searchParams.get('state')).toBe(request.state);
    expect(url.searchParams.get('nonce')).toBe(request.nonce);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBe(env.GOOGLE_REDIRECT_URI);
  });

  it('generates a fresh state, nonce, and code verifier on every call', () => {
    const a = createAuthorizationRequest(env);
    const b = createAuthorizationRequest(env);
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe('assertVerifiedIdentity', () => {
  const baseIdentity: GoogleIdentity = { sub: 'sub-1', email: 'a@example.com', emailVerified: true, name: 'A' };

  it('accepts a verified identity', () => {
    expect(() => assertVerifiedIdentity(baseIdentity)).not.toThrow();
  });

  /**
   * A plain `Error` here reached `errorHandler`'s final branch and became a 500 — the API
   * reporting a server fault for a Google account that simply has no verified email
   * (specs/authentication/spec.md - "Unverified Google email cannot create a reader").
   */
  it('rejects an unverified identity as a client error, not a server fault', () => {
    expect(() => assertVerifiedIdentity({ ...baseIdentity, emailVerified: false })).toThrow(
      expect.objectContaining({ status: 403, code: 'email_not_verified' }),
    );
  });
});

describe('verifyGoogleIdToken', () => {
  /**
   * The nonce check is the replay defence: without it a callback captured from one sign-in can
   * be replayed into another. It threw a plain `Error`, so a replay surfaced as a 500 rather
   * than a rejection (specs/authentication/spec.md - "Mismatched nonce is rejected").
   */
  it('rejects a nonce mismatch as a 400 rather than an unhandled server error', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const idToken = await new SignJWT({ nonce: 'the-wrong-nonce', email: 'a@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(env.GOOGLE_CLIENT_ID)
      .setSubject('sub-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifyGoogleIdToken(idToken, env, 'the-expected-nonce', createLocalJwks(publicKey))).rejects.toThrow(
      expect.objectContaining({ status: 400, code: 'invalid_oauth_callback' }),
    );
  });

  it('accepts an assertion whose nonce matches the one bound to this sign-in', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const idToken = await new SignJWT({ nonce: 'bound-nonce', email: 'a@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(env.GOOGLE_CLIENT_ID)
      .setSubject('sub-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    const identity = await verifyGoogleIdToken(idToken, env, 'bound-nonce', createLocalJwks(publicKey));
    expect(identity).toMatchObject({ sub: 'sub-1', email: 'a@example.com', emailVerified: true });
  });

  it('reports email_verified false rather than assuming verification', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const idToken = await new SignJWT({ nonce: 'bound-nonce', email: 'a@example.com', email_verified: false })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(env.GOOGLE_CLIENT_ID)
      .setSubject('sub-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    const identity = await verifyGoogleIdToken(idToken, env, 'bound-nonce', createLocalJwks(publicKey));
    expect(identity.emailVerified).toBe(false);
    expect(() => assertVerifiedIdentity(identity)).toThrow(expect.objectContaining({ status: 403 }));
  });

  it('rejects an assertion issued for a different client', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const idToken = await new SignJWT({ nonce: 'bound-nonce', email: 'a@example.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience('some-other-client')
      .setSubject('sub-1')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifyGoogleIdToken(idToken, env, 'bound-nonce', createLocalJwks(publicKey))).rejects.toThrow();
  });
});
