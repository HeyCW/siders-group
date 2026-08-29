import { eq } from 'drizzle-orm';
import { newId, readers } from '@siders/db';
/**
 * Upsert keyed on `google_sub` — never on email (specs/authentication/spec.md - "Reader sign-in
 * via Google"). MySQL's `ON DUPLICATE KEY UPDATE` has no `target` clause the way Postgres's `ON
 * CONFLICT` does — it fires on *any* unique-key collision the statement causes, not a named one.
 * `google_sub` is the only unique column this insert can collide on (the primary key is a fresh
 * client-generated id every call), so that difference doesn't change behavior here. On a
 * collision, MySQL keeps the existing row's id and applies only the `set` fields — the new,
 * unused id generated below is simply discarded, mirroring `onConflictDoUpdate`'s semantics.
 */
export function createReaderRepository(db) {
    return {
        async upsertByGoogleSub(input) {
            await db
                .insert(readers)
                .values({
                id: newId(),
                googleSub: input.googleSub,
                email: input.email,
                emailVerified: input.emailVerified,
                name: input.name,
                avatarUrl: input.avatarUrl ?? null,
                lastLoginAt: new Date(),
            })
                .onDuplicateKeyUpdate({
                set: {
                    email: input.email,
                    emailVerified: input.emailVerified,
                    name: input.name,
                    avatarUrl: input.avatarUrl ?? null,
                    lastLoginAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            const [row] = await db
                .select({ id: readers.id, googleSub: readers.googleSub, status: readers.status })
                .from(readers)
                .where(eq(readers.googleSub, input.googleSub))
                .limit(1);
            if (!row)
                throw new Error('reader missing immediately after upsert');
            return row;
        },
    };
}
