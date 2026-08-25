import { and, eq, isNull, ne } from 'drizzle-orm';
import { newId, readers, sessions, users, type Database } from '@siders/db';

export type SubjectType = 'staff' | 'reader';

export interface SessionRow {
  id: string;
  subjectId: string;
  subjectType: SubjectType;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateSessionInput {
  subjectId: string;
  subjectType: SubjectType;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  userAgent?: string | undefined;
  ipHash?: string | undefined;
}

/** Drizzle queries only — no Express types here (module-per-feature layering). */
export interface ReaderAccountRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: 'active' | 'banned';
  createdAt: Date;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<SessionRow>;
  findByRefreshTokenHash(hash: string): Promise<SessionRow | null>;
  revoke(sessionId: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForSubject(subjectType: SubjectType, subjectId: string): Promise<void>;
  /** Everything but `exceptSessionId` — a self-service password change must not sign the caller out of the request that made it. */
  revokeAllForSubjectExcept(subjectType: SubjectType, subjectId: string, exceptSessionId: string): Promise<void>;
  revokeAll(): Promise<void>;
  isSubjectActive(subjectType: SubjectType, subjectId: string): Promise<boolean>;
  findReaderAccount(subjectId: string): Promise<ReaderAccountRow | null>;
}

function toSessionRow(row: typeof sessions.$inferSelect): SessionRow {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectType: row.subjectType,
    refreshTokenHash: row.refreshTokenHash,
    familyId: row.familyId,
    expiresAt: row.expiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
  };
}

export function createSessionRepository(db: Database): SessionRepository {
  return {
    async create(input) {
      const id = newId();
      await db.insert(sessions).values({
        id,
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        refreshTokenHash: input.refreshTokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        userAgent: input.userAgent ?? null,
        ipHash: input.ipHash ?? null,
      });
      // Every field `SessionRow` exposes is already known from `id`/`input` — unlike a caller
      // that needs a joined view, there's nothing here a re-select would add (`created_at` isn't
      // part of `SessionRow`), so this runs on every login and refresh-token rotation without
      // the extra round trip a select-back would cost.
      return {
        id,
        subjectId: input.subjectId,
        subjectType: input.subjectType,
        refreshTokenHash: input.refreshTokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
        revokedAt: null,
      };
    },

    async findByRefreshTokenHash(hash) {
      const [row] = await db.select().from(sessions).where(eq(sessions.refreshTokenHash, hash)).limit(1);
      return row ? toSessionRow(row) : null;
    },

    async revoke(sessionId) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
    },

    async revokeFamily(familyId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
    },

    async revokeAllForSubject(subjectType, subjectId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.subjectType, subjectType),
            eq(sessions.subjectId, subjectId),
            isNull(sessions.revokedAt),
          ),
        );
    },

    async revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.subjectType, subjectType),
            eq(sessions.subjectId, subjectId),
            isNull(sessions.revokedAt),
            ne(sessions.id, exceptSessionId),
          ),
        );
    },

    async revokeAll() {
      await db.update(sessions).set({ revokedAt: new Date() }).where(isNull(sessions.revokedAt));
    },

    async isSubjectActive(subjectType, subjectId) {
      if (subjectType === 'staff') {
        const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, subjectId)).limit(1);
        return row?.status === 'active';
      }
      const [row] = await db
        .select({ status: readers.status })
        .from(readers)
        .where(eq(readers.id, subjectId))
        .limit(1);
      return row?.status === 'active';
    },

    async findReaderAccount(subjectId) {
      const [row] = await db
        .select({
          id: readers.id,
          email: readers.email,
          name: readers.name,
          avatarUrl: readers.avatarUrl,
          status: readers.status,
          createdAt: readers.createdAt,
        })
        .from(readers)
        .where(eq(readers.id, subjectId))
        .limit(1);
      return row ?? null;
    },
  };
}
