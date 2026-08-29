import { publicUrlFor } from '../../lib/mediaStorage.js';
export function toAnakUsahaResponse(row) {
    return { id: row.id, name: row.name, slug: row.slug };
}
/**
 * The admin presentation screen's shape: every entry, profile fields present regardless of
 * `isActive` so staff can see and edit an inactive profile
 * (specs/anak-usaha-presentation/spec.md - "Deactivating a profile hides it from public output
 * without deleting it").
 */
export function toAnakUsahaAdminResponse(env, row) {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        profile: row.profile
            ? {
                logoUrl: row.profile.logoStoragePath ? publicUrlFor(env, row.profile.logoStoragePath) : null,
                backgroundColor: row.profile.backgroundColor,
                description: row.profile.description,
                kind: row.profile.kind,
                links: row.profile.links,
                sortOrder: row.profile.sortOrder,
                isActive: row.profile.isActive,
            }
            : null,
    };
}
/**
 * The public shape: every entry keeps its plain `{id, name, slug}`, and only gains presentation
 * fields when it has an active profile — entries with no profile, or an inactive one, are
 * indistinguishable from the pre-presentation response
 * (design.md - "Public data folded into the existing GET /anak-usaha endpoint").
 */
export function toPublicAnakUsaha(env, row) {
    if (!row.profile || !row.profile.isActive) {
        return { id: row.id, name: row.name, slug: row.slug };
    }
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.profile.logoStoragePath ? publicUrlFor(env, row.profile.logoStoragePath) : null,
        backgroundColor: row.profile.backgroundColor,
        description: row.profile.description,
        kind: row.profile.kind,
        links: row.profile.links,
        sortOrder: row.profile.sortOrder,
    };
}
