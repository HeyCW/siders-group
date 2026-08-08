import { describe, expect, it } from 'vitest';
import { decodeOAuthState, encodeOAuthState, type OAuthStateCookiePayload } from './oauthState.js';

describe('OAuth state cookie', () => {
  const payload: OAuthStateCookiePayload = {
    state: 'state-value',
    codeVerifier: 'verifier-value',
    nonce: 'nonce-value',
    next: '/dashboard',
  };

  it('round-trips through encode and decode', () => {
    expect(decodeOAuthState(encodeOAuthState(payload))).toEqual(payload);
  });

  it('returns null for garbage input', () => {
    expect(decodeOAuthState('not-base64-json')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const incomplete = Buffer.from(JSON.stringify({ state: 'only-state' })).toString('base64url');
    expect(decodeOAuthState(incomplete)).toBeNull();
  });
});
