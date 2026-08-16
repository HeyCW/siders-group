import type { PartnerResponse, PublicPartner } from '@siders/contracts';
import { publicUrlFor } from '../../lib/mediaStorage.js';
import type { PartnerRow } from './partner.repository.js';

/** `logoUrl` is derived from the joined media's `storage_path` here, at map time — never stored
 *  on the row, mirroring `reel.mapper.ts`'s `toReelResponse`. */
export function toPartnerResponse(env: { MEDIA_PUBLIC_BASE_URL: string }, row: PartnerRow): PartnerResponse {
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
export function toPublicPartner(env: { MEDIA_PUBLIC_BASE_URL: string }, row: PartnerRow): PublicPartner {
  return {
    name: row.name,
    logoUrl: publicUrlFor(env, row.logoStoragePath),
    websiteUrl: row.websiteUrl,
  };
}
