export function toRoleResponse(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        isSystem: row.isSystem,
        permissions: row.permissions,
    };
}
export function toRoleSummaryResponse(row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        isSystem: row.isSystem,
        holderCount: row.holderCount,
    };
}
export function toRoleDetailResponse(row) {
    return { ...toRoleResponse(row), holderCount: row.holderCount };
}
