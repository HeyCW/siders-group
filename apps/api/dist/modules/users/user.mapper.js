/** Never let a raw row (e.g. `password_hash`) reach the client — always through this mapper. */
export function toStaffUserDto(row) {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        roleId: row.roleId,
        roleName: row.roleName,
        status: row.status,
        mustChangePassword: row.mustChangePassword,
        createdAt: row.createdAt.toISOString(),
        permissionKeys: row.permissionKeys,
        isOwner: row.isOwner,
    };
}
