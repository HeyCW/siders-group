import { eq } from 'drizzle-orm';
import { roles, users } from '@siders/db';
export function createUserRepository(db) {
    return {
        async findById(id) {
            const [row] = await db
                .select({
                id: users.id,
                email: users.email,
                name: users.name,
                roleId: users.roleId,
                roleName: roles.name,
                status: users.status,
                mustChangePassword: users.mustChangePassword,
                createdAt: users.createdAt,
            })
                .from(users)
                .innerJoin(roles, eq(users.roleId, roles.id))
                .where(eq(users.id, id))
                .limit(1);
            return row ?? null;
        },
    };
}
