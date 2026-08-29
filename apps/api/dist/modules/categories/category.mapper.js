export function toCategoryResponse(row) {
    return { id: row.id, name: row.name, slug: row.slug };
}
