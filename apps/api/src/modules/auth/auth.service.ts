import { AppError } from '../../middleware/errorHandler.js';
import { issueCsrfToken, type CsrfEnv } from '../../lib/csrf.js';
import {
  issueRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  type TokenSigningEnv,
} from '../../lib/tokens.js';
import { sha256Hex } from '../../lib/hashCompare.js';
import type { ReaderAccountRow, SessionRepository, SubjectType } from './session.repository.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding
const ABSOLUTE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // hard cap, never extended

export interface SessionMeta {
  userAgent?: string | undefined;
  ipHash?: string | undefined;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  subjectId: string;
  subjectType: SubjectType;
}

/** Rules, permissions, orchestration — never imports Drizzle directly. */
export interface AuthService {
  startSession(subjectId: string, subjectType: SubjectType, meta: SessionMeta): Promise<IssuedSession>;
  refresh(rawRefreshToken: string, meta: SessionMeta): Promise<IssuedSession>;
  logout(rawRefreshToken: string | undefined): Promise<void>;
  revokeAllForSubject(subjectType: SubjectType, subjectId: string): Promise<void>;
  revokeAllForSubjectExcept(subjectType: SubjectType, subjectId: string, exceptSessionId: string): Promise<void>;
  revokeAll(): Promise<void>;
  getReaderAccount(subjectId: string): Promise<ReaderAccountRow | null>;
}

export function createAuthService(
  repository: SessionRepository,
  env: TokenSigningEnv & CsrfEnv,
): AuthService {
  async function issueTokens(
    sessionId: string,
    subjectId: string,
    subjectType: SubjectType,
    refreshToken: string,
  ): Promise<IssuedSession> {
    const accessToken = await signAccessToken({ subjectId, subjectType, sessionId }, env);
    return {
      accessToken,
      refreshToken,
      // Bound to this session id, so the token issued before a rotation stops being accepted.
      csrfToken: issueCsrfToken(env, sessionId),
      sessionId,
      subjectId,
      subjectType,
    };
  }

  return {
    async startSession(subjectId, subjectType, meta) {
      const { token, tokenHash, familyId } = issueRefreshToken();
      const now = Date.now();
      const row = await repository.create({
        subjectId,
        subjectType,
        refreshTokenHash: tokenHash,
        familyId,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        absoluteExpiresAt: new Date(now + ABSOLUTE_SESSION_TTL_MS),
        userAgent: meta.userAgent,
        ipHash: meta.ipHash,
      });
      return issueTokens(row.id, subjectId, subjectType, token);
    },

    async refresh(rawRefreshToken, meta) {
      const tokenHash = sha256Hex(rawRefreshToken);
      const row = await repository.findByRefreshTokenHash(tokenHash);
      if (!row) {
        throw new AppError('Invalid refresh token', 401, 'invalid_refresh_token');
      }

      if (row.revokedAt) {
        // Reuse of an already-rotated token: treat as compromise, end the whole lineage.
        await repository.revokeFamily(row.familyId);
        throw new AppError('Refresh token reuse detected', 401, 'refresh_reuse_detected');
      }

      const now = Date.now();
      if (row.expiresAt.getTime() < now || row.absoluteExpiresAt.getTime() < now) {
        await repository.revoke(row.id);
        throw new AppError('Session expired', 401, 'session_expired');
      }

      const active = await repository.isSubjectActive(row.subjectType, row.subjectId);
      if (!active) {
        await repository.revoke(row.id);
        throw new AppError('Account is no longer active', 401, 'account_inactive');
      }

      await repository.revoke(row.id);
      const { token, tokenHash: newHash } = rotateRefreshToken(row.familyId);
      const newRow = await repository.create({
        subjectId: row.subjectId,
        subjectType: row.subjectType,
        refreshTokenHash: newHash,
        familyId: row.familyId,
        expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
        absoluteExpiresAt: row.absoluteExpiresAt, // hard cap carries forward, never extended
        userAgent: meta.userAgent,
        ipHash: meta.ipHash,
      });
      return issueTokens(newRow.id, row.subjectId, row.subjectType, token);
    },

    async logout(rawRefreshToken) {
      if (!rawRefreshToken) return;
      const row = await repository.findByRefreshTokenHash(sha256Hex(rawRefreshToken));
      if (row) await repository.revoke(row.id);
    },

    async revokeAllForSubject(subjectType, subjectId) {
      await repository.revokeAllForSubject(subjectType, subjectId);
    },

    async revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId) {
      await repository.revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId);
    },

    async revokeAll() {
      await repository.revokeAll();
    },

    async getReaderAccount(subjectId) {
      return repository.findReaderAccount(subjectId);
    },
  };
}
