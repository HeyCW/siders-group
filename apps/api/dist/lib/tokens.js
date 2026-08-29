import { randomBytes, randomUUID } from 'node:crypto';
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
import { sha256Hex } from './hashCompare.js';
const ISSUER = 'siders-api';
const AUDIENCE = 'siders';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ALG = 'EdDSA';
export const REFRESH_TOKEN_COOKIE = 'sid_rt';
/**
 * Signs the 15-minute access credential. Deliberately carries no role or permission data —
 * embedding either would make revocation and role changes wait out the credential's
 * lifetime instead of taking effect on the caller's next request.
 */
export async function signAccessToken(claims, env) {
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
export async function verifyAccessToken(token, env) {
    const publicKey = await importSPKI(env.ACCESS_TOKEN_PUBLIC_KEY, ALG);
    const { payload } = await jwtVerify(token, publicKey, { issuer: ISSUER, audience: AUDIENCE });
    const { sub, type, sid } = payload;
    if (typeof sub !== 'string' || typeof sid !== 'string' || (type !== 'staff' && type !== 'reader')) {
        throw new Error('malformed access token claims');
    }
    return { subjectId: sub, subjectType: type, sessionId: sid };
}
function generateOpaqueToken() {
    return randomBytes(32).toString('base64url'); // 256 bits
}
/** First issuance for a new session — mints a fresh `familyId`. */
export function issueRefreshToken() {
    const token = generateOpaqueToken();
    return { token, tokenHash: sha256Hex(token), familyId: randomUUID() };
}
/**
 * Refresh rotation — reuses the caller-supplied `familyId` so the whole lineage can be
 * revoked at once if an already-used token is ever replayed (reuse detection lives in the
 * session repository, which is the one place that reads/writes `app.sessions`).
 */
export function rotateRefreshToken(familyId) {
    const token = generateOpaqueToken();
    return { token, tokenHash: sha256Hex(token), familyId };
}
