import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface GoogleEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
}

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

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
    throw new Error(`Google token exchange failed: ${response.status}`);
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
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });

  if (payload.nonce !== expectedNonce) {
    throw new Error('Google ID token nonce mismatch');
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('malformed Google ID token');
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
    throw new Error('Google account email is not verified');
  }
}
