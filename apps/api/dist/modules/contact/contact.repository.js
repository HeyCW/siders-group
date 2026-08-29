import { count, desc, eq } from 'drizzle-orm';
import { contactMessages, newId } from '@siders/db';
export function createContactMessageRepository(db) {
    return {
        async submit(input) {
            const id = newId();
            await db.insert(contactMessages).values({
                id,
                name: input.name,
                organisation: input.organisation ?? null,
                email: input.email,
                subject: input.subject ?? null,
                message: input.message,
            });
            const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1);
            if (!row)
                throw new Error('contact message missing immediately after insert');
            return row;
        },
        async list(filter) {
            const where = filter === 'all' ? undefined : eq(contactMessages.status, filter);
            const query = db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
            return where ? query.where(where) : query;
        },
        async countUnread() {
            const [row] = await db.select({ value: count() }).from(contactMessages).where(eq(contactMessages.status, 'new'));
            return row?.value ?? 0;
        },
        async setStatus(id, status) {
            await db.update(contactMessages).set({ status }).where(eq(contactMessages.id, id));
            const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1);
            return row ?? null;
        },
    };
}
