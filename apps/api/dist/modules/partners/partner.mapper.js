import { publicUrlFor } from '../../lib/mediaStorage.js';
/** `logoUrl` is derived from the joined media's `storage_path` here, at map time — never stored
 *  on the row, mirroring `guidePick.mapper.ts`'s `toGuidePickResponse`. */
export function toPartnerResponse(env, row) {
    return {
        id: row.id,
        name: row.name,
        logoUrl: publicUrlFor(env, row.logoStoragePath),
        websiteUrl: row.websiteUrl,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}
/** The public shape carries no `isActive` or `sortOrder` — every entry here is implicitly active,
 *  and array position already carries the order (specs/partner-management/spec.md - "Public
 *  partner listing serves only active partners in order"). */
export function toPublicPartner(env, row) {
    return {
        name: row.name,
        logoUrl: publicUrlFor(env, row.logoStoragePath),
        websiteUrl: row.websiteUrl,
    };
}
