import type { GuidePickResponse, PublicGuidePick } from '@siders/contracts';
import { publicUrlFor } from '../../lib/mediaStorage.js';
import type { GuidePickRow } from './guidePick.repository.js';

/** `photoUrl` is derived from the joined media's `storage_path` here, at map time — never stored
 *  on the row, mirroring `partner.mapper.ts`'s `toPartnerResponse`. */
export function toGuidePickResponse(env: { MEDIA_PUBLIC_BASE_URL: string }, row: GuidePickRow): GuidePickResponse {
  return {
    id: row.id,
    city: row.city,
    place: row.place,
    description: row.description,
    photoUrl: publicUrlFor(env, row.photoStoragePath),
    videoUrl: publicUrlFor(env, row.videoStoragePath),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The public shape carries no `id`, `isActive`, or `sortOrder` — every entry here is implicitly
 *  active, and array position already carries the order
 *  (specs/guide-of-the-week-management/spec.md - "Public read serves only active guide picks in
 *  order"). */
export function toPublicGuidePick(env: { MEDIA_PUBLIC_BASE_URL: string }, row: GuidePickRow): PublicGuidePick {
  return {
    city: row.city,
    place: row.place,
    description: row.description,
    photoUrl: publicUrlFor(env, row.photoStoragePath),
    videoUrl: publicUrlFor(env, row.videoStoragePath),
  };
}
