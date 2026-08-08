import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAuthService, type AuthService } from './auth.service.js';
import type {
  CreateSessionInput,
  ReaderAccountRow,
  SessionRepository,
  SessionRow,
  SubjectType,
} from './session.repository.js';

/** In-memory fake — exercises auth.service.ts's actual logic without a live database, per
 *  the testing approach settled in openspec/changes/add-auth-foundation/design.md. */
function createFakeSessionRepository() {
  const rows = new Map<string, SessionRow>();
  const activeSubjects = new Set<string>(['staff:staff-1', 'reader:reader-1']);

  const repository: SessionRepository = {
    async create(input: CreateSessionInput) {
      const row: SessionRow = { id: randomUUID(), revokedAt: null, ...input };
      rows.set(row.id, row);
      return row;
    },
    async findByRefreshTokenHash(hash) {
      for (const row of rows.values()) {
        if (row.refreshTokenHash === hash) return row;
      }
      return null;
    },
    async revoke(sessionId) {
      const row = rows.get(sessionId);
      if (row) row.revokedAt = new Date();
    },
    async revokeFamily(familyId) {
      for (const row of rows.values()) {
        if (row.familyId === familyId && !row.revokedAt) row.revokedAt = new Date();
      }
    },
    async revokeAllForSubject(subjectType, subjectId) {
      for (const row of rows.values()) {
        if (row.subjectType === subjectType && row.subjectId === subjectId && !row.revokedAt) {
          row.revokedAt = new Date();
        }
      }
    },
    async revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId) {
      for (const row of rows.values()) {
        if (
          row.subjectType === subjectType &&
          row.subjectId === subjectId &&
          row.id !== exceptSessionId &&
          !row.revokedAt
        ) {
          row.revokedAt = new Date();
        }
      }
    },
    async revokeAll() {
      for (const row of rows.values()) {
        if (!row.revokedAt) row.revokedAt = new Date();
      }
    },
    async isSubjectActive(subjectType, subjectId) {
      return activeSubjects.has(`${subjectType}:${subjectId}`);
    },
    async findReaderAccount(): Promise<ReaderAccountRow | null> {
      return null;
    },
  };

  return { repository, rows, deactivate: (t: SubjectType, id: string) => activeSubjects.delete(`${t}:${id}`) };
}

function makeEnv() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    ACCESS_TOKEN_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ACCESS_TOKEN_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    SESSION_SECRET: 'a'.repeat(32),
  };
}

describe('AuthService', () => {
  let fake: ReturnType<typeof createFakeSessionRepository>;
  let service: AuthService;

  beforeEach(() => {
    fake = createFakeSessionRepository();
    service = createAuthService(fake.repository, makeEnv());
  });

  it('starts a session with an access token, a refresh token, and a CSRF token', async () => {
    const issued = await service.startSession('staff-1', 'staff', {});
    expect(issued.accessToken).toBeTruthy();
    expect(issued.refreshToken).toBeTruthy();
    expect(issued.csrfToken).toBeTruthy();
    expect(fake.rows.size).toBe(1);
  });

  it('refresh rotates the token, keeps the family id, and carries the absolute expiry forward', async () => {
    const started = await service.startSession('staff-1', 'staff', {});
    const originalRow = [...fake.rows.values()][0];

    const refreshed = await service.refresh(started.refreshToken, {});

    expect(refreshed.refreshToken).not.toBe(started.refreshToken);
    expect(refreshed.sessionId).not.toBe(started.sessionId);

    const rotatedRow = fake.rows.get(refreshed.sessionId);
    expect(rotatedRow?.familyId).toBe(originalRow?.familyId);
    expect(rotatedRow?.absoluteExpiresAt.getTime()).toBe(originalRow?.absoluteExpiresAt.getTime());

    const oldRow = fake.rows.get(started.sessionId);
    expect(oldRow?.revokedAt).not.toBeNull();
  });

  it('rejects an unknown refresh token', async () => {
    await expect(service.refresh('unknown-token', {})).rejects.toMatchObject({ status: 401 });
  });

  it('detects reuse of an already-rotated token and revokes the whole family', async () => {
    const started = await service.startSession('staff-1', 'staff', {});
    const originalRow = [...fake.rows.values()][0];
    await service.refresh(started.refreshToken, {}); // rotates once, revoking the original

    await expect(service.refresh(started.refreshToken, {})).rejects.toMatchObject({
      status: 401,
      code: 'refresh_reuse_detected',
    });

    // Every session in the family — including the one just minted by the legitimate
    // rotation above — is now revoked.
    for (const row of fake.rows.values()) {
      if (row.familyId === originalRow?.familyId) {
        expect(row.revokedAt).not.toBeNull();
      }
    }
  });

  it('refuses to refresh a session for a deactivated account', async () => {
    const started = await service.startSession('staff-1', 'staff', {});
    fake.deactivate('staff', 'staff-1');

    await expect(service.refresh(started.refreshToken, {})).rejects.toMatchObject({
      status: 401,
      code: 'account_inactive',
    });
    expect(fake.rows.get(started.sessionId)?.revokedAt).not.toBeNull();
  });

  it('refuses to refresh past the absolute session lifetime', async () => {
    const started = await service.startSession('staff-1', 'staff', {});
    const row = fake.rows.get(started.sessionId);
    if (row) row.absoluteExpiresAt = new Date(Date.now() - 1000); // force past the hard cap

    await expect(service.refresh(started.refreshToken, {})).rejects.toMatchObject({
      status: 401,
      code: 'session_expired',
    });
  });

  it('logout revokes the session referenced by the refresh token', async () => {
    const started = await service.startSession('staff-1', 'staff', {});
    await service.logout(started.refreshToken);
    expect(fake.rows.get(started.sessionId)?.revokedAt).not.toBeNull();
  });

  it('logout with no refresh token is a harmless no-op', async () => {
    await expect(service.logout(undefined)).resolves.toBeUndefined();
  });

  it('revokeAllForSubject ends every session for that subject', async () => {
    const a = await service.startSession('staff-1', 'staff', {});
    const b = await service.refresh(a.refreshToken, {});
    await service.revokeAllForSubject('staff', 'staff-1');
    expect(fake.rows.get(b.sessionId)?.revokedAt).not.toBeNull();
  });

  it('revokeAllForSubjectExcept spares the one session named, ending the rest', async () => {
    const spared = await service.startSession('staff-1', 'staff', {});
    const other = await service.startSession('staff-1', 'staff', {});
    await service.revokeAllForSubjectExcept('staff', 'staff-1', spared.sessionId);
    expect(fake.rows.get(spared.sessionId)?.revokedAt).toBeNull();
    expect(fake.rows.get(other.sessionId)?.revokedAt).not.toBeNull();
  });
});
