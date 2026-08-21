import type { AnakUsahaLink, PublicAnakUsaha } from '@siders/contracts';

export interface PresentedAnakUsaha {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  kind: 'Media Platform' | 'News & Community';
  links: AnakUsahaLink[];
  sortOrder: number;
}

/**
 * Narrows the public `/anak-usaha` listing (every entry, presentation fields only for one with an
 * active profile) down to what the site's Anak Usaha section actually renders
 * (specs/anak-usaha-presentation/spec.md - "The public site renders only entries with an active
 * profile"). An entry carries `kind` if, and only if, it has an active profile — the mapper
 * (`apps/api/src/modules/anak-usaha/anakUsaha.mapper.ts`) always sets every presentation field
 * together, never a subset, so checking this one is enough to know the rest are present too.
 * Sorted defensively by `sortOrder` rather than trusting response order.
 */
export function presentedAnakUsaha(list: PublicAnakUsaha[]): PresentedAnakUsaha[] {
  return list
    .filter((entry) => entry.kind !== undefined)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      logoUrl: entry.logoUrl ?? null,
      description: entry.description ?? null,
      kind: entry.kind as PresentedAnakUsaha['kind'],
      links: entry.links ?? [],
      sortOrder: entry.sortOrder ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
