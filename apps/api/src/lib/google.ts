import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '../middleware/errorHandler.js';

export interface GoogleEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** The key-resolver shape `jose.jwtVerify` accepts — a remote JWKS in production, a local key in tests. */
export type GoogleKeySet = Parameters<typeof jwtVerify>[1];

export interface GoogleAuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
  nonce: string;
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * `state` + PKCE (S256) + `nonce` — every one a non-negotiable per docs/ARCHITECTURE.md §5.2
 * and its own §12 pitfall #6 ("missing `state` check ... nothing will fail visibly").
 */
export function createAuthorizationRequest(env: GoogleEnv): GoogleAuthorizationRequest {
  const state = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { url: url.toString(), state, codeVerifier, nonce };
}

export interface GoogleTokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
}

/** The exchange itself is server-side only — the browser never sees a client secret. */
export async function exchangeAuthorizationCode(
  env: GoogleEnv,
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    // The code was bad, replayed, or issued for another client — all client-side conditions.
    throw new AppError('Google authorization code exchange failed', 400, 'invalid_oauth_callback');
  }
  return (await response.json()) as GoogleTokenResponse;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string;
}

/**
 * Verify the ID token against Google's JWKS — never trust it unverified. Google's own
 * access/refresh tokens are discarded by the caller after this call; there is no reason to
 * store them (docs/ARCHITECTURE.md §5.2 — "we want identity, not API access").
 */
export async function verifyGoogleIdToken(
  idToken: string,
  env: GoogleEnv,
  expectedNonce: string,
  /**
   * Defaults to Google's live JWKS. Injectable so the nonce, audience, and issuer checks are
   * testable against a locally signed assertion — they are the replay and token-substitution
   * defences, and reaching them over the network is what left them uncovered.
   */
  jwks: GoogleKeySet = GOOGLE_JWKS,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });

  // Typed so the callback answers 400, not 500. A replayed or tampered assertion is a bad
  // request, and CLAUDE.md asks for errors to travel as AppError subclasses; a plain Error here
  // fell through errorHandler's final branch and reported a server fault for a client one.
  if (payload.nonce !== expectedNonce) {
    throw new AppError('Google ID token nonce mismatch', 400, 'invalid_oauth_callback');
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new AppError('Malformed Google ID token', 400, 'invalid_oauth_callback');
  }

  const avatarUrl = typeof payload.picture === 'string' ? payload.picture : undefined;
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : payload.email,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

/**
 * A separate, deliberately trivial assertion — kept apart from `verifyGoogleIdToken` so the
 * "reject unverified email" rule is a single, independently testable statement rather than
 * buried inside a network-dependent verification call (specs/authentication/spec.md -
 * "Unverified Google email cannot create a reader").
 */
export function assertVerifiedIdentity(identity: GoogleIdentity): void {
  if (!identity.emailVerified) {
    throw new AppError('Google account email is not verified', 403, 'email_not_verified');
  }
}
