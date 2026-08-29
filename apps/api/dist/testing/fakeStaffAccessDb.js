/**
 * A tiny fake query builder mimicking the shape `resolveStaffAccess`/`resolveReaderAccess`
 * chain against: `.select().from().innerJoin().leftJoin().where()` / `.limit()`. Shared by
 * `authorize.test.ts` and `role.routes.test.ts`, which each need to mock the same internal
 * `getDatabase()` call that `requirePermission`/`requireAnyPermission` make while testing
 * something else entirely (a route handler, not the guard itself).
 */
export function fakeStaffAccessDbReturning(rows) {
    const builder = {
        select: () => builder,
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        limit: () => Promise.resolve(rows),
        // when awaited directly without .limit() (the staff query has no .limit()) — resolve to rows.
        then: (resolve) => resolve(rows),
    };
    return builder;
}
