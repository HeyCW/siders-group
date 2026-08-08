import { describe, expect, it } from 'vitest';
import { assertVerifiedIdentity, createAuthorizationRequest, type GoogleEnv, type GoogleIdentity } from './google.js';

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

  it('rejects an unverified identity', () => {
    expect(() => assertVerifiedIdentity({ ...baseIdentity, emailVerified: false })).toThrow(/not verified/);
  });
});
