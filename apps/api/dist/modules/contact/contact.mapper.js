export function toContactMessageSubmitResponse(row) {
    return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
    };
}
export function toContactMessageRow(row) {
    return {
        id: row.id,
        name: row.name,
        organisation: row.organisation,
        email: row.email,
        subject: row.subject,
        message: row.message,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
    };
}
