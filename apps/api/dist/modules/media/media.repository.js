import { eq } from 'drizzle-orm';
import { media, newId } from '@siders/db';
import { stripUndefined } from '../../lib/stripUndefined.js';
export function createMediaRepository(db) {
    return {
        async create(input) {
            const id = newId();
            await db.insert(media).values({ ...input, id });
            const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
            if (!row)
                throw new Error('media missing immediately after insert');
            return row;
        },
        async findById(id) {
            const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
            return row ?? null;
        },
        async update(id, input) {
            await db.update(media).set(stripUndefined(input)).where(eq(media.id, id));
            const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
            if (!row)
                throw new Error('media missing immediately after update');
            return row;
        },
        async delete(id) {
            await db.delete(media).where(eq(media.id, id));
        },
    };
}
