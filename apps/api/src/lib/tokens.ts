import { randomBytes, randomUUID } from 'node:crypto';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
import { sha256Hex } from './hashCompare.js';

const ISSUER = 'siders-api';
const AUDIENCE = 'siders';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ALG = 'EdDSA';

export const REFRESH_TOKEN_COOKIE = 'sid_rt';

export interface AccessTokenClaims {
  subjectId: string;
  subjectType: 'staff' | 'reader';
  /** References the session row — never a role or permission. See design.md - Decisions. */
  sessionId: string;
}

export interface TokenSigningEnv {
  ACCESS_TOKEN_PRIVATE_KEY: string;
  ACCESS_TOKEN_PUBLIC_KEY: string;
}

/**
 * Signs the 15-minute access credential. Deliberately carries no role or permission data —
 * embedding either would make revocation and role changes wait out the credential's
 * lifetime instead of taking effect on the caller's next request.
 */
export async function signAccessToken(claims: AccessTokenClaims, env: TokenSigningEnv): Promise<string> {
  const privateKey = await importPKCS8(env.ACCESS_TOKEN_PRIVATE_KEY, ALG);
  return new SignJWT({ type: claims.subjectType, sid: claims.sessionId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.subjectId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(privateKey);
}

/** Local EdDSA verification only — no database read (docs/ARCHITECTURE.md §5.5). */
export async function verifyAccessToken(token: string, env: TokenSigningEnv): Promise<AccessTokenClaims> {
  const publicKey = await importSPKI(env.ACCESS_TOKEN_PUBLIC_KEY, ALG);
  const { payload } = await jwtVerify(token, publicKey, { issuer: ISSUER, audience: AUDIENCE });
  const { sub, type, sid } = payload;
  if (typeof sub !== 'string' || typeof sid !== 'string' || (type !== 'staff' && type !== 'reader')) {
    throw new Error('malformed access token claims');
  }
  return { subjectId: sub, subjectType: type, sessionId: sid };
}

export interface IssuedRefreshToken {
  /** Raw value — set as the refresh cookie, never stored. */
  token: string;
  /** SHA-256 hex of `token` — what actually lives in `app.sessions.refresh_token_hash`. */
  tokenHash: string;
  /** Rotation lineage. A brand-new session mints one; every rotation carries it forward. */
  familyId: string;
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url'); // 256 bits
}

/** First issuance for a new session — mints a fresh `familyId`. */
export function issueRefreshToken(): IssuedRefreshToken {
  const token = generateOpaqueToken();
  return { token, tokenHash: sha256Hex(token), familyId: randomUUID() };
}

/**
 * Refresh rotation — reuses the caller-supplied `familyId` so the whole lineage can be
 * revoked at once if an already-used token is ever replayed (reuse detection lives in the
 * session repository, which is the one place that reads/writes `app.sessions`).
 */
export function rotateRefreshToken(familyId: string): IssuedRefreshToken {
  const token = generateOpaqueToken();
  return { token, tokenHash: sha256Hex(token), familyId };
}
