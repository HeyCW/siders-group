import { and, eq, isNull, ne } from 'drizzle-orm';
import { newId, readers, sessions, users } from '@siders/db';
function toSessionRow(row) {
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
export function createSessionRepository(db) {
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
                .where(and(eq(sessions.subjectType, subjectType), eq(sessions.subjectId, subjectId), isNull(sessions.revokedAt)));
        },
        async revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId) {
            await db
                .update(sessions)
                .set({ revokedAt: new Date() })
                .where(and(eq(sessions.subjectType, subjectType), eq(sessions.subjectId, subjectId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId)));
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
