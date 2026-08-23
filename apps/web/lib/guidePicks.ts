import type { PublicGuidePick } from '@siders/contracts';

export interface GuidePickCityGroup {
  /** The city value as first encountered, used as both the display label and the React key. */
  city: string;
  picks: PublicGuidePick[];
}

/**
 * Buckets a flat, already-ordered list of guide picks by city, entirely client-side — the public
 * endpoint returns one flat ordered collection and carries no grouping of its own
 * (specs/guide-of-the-week-management/spec.md - "Public read serves only active guide picks in
 * order"). Grouping is a presentation concern of this page
 * (specs/web-public-site/spec.md - "The guideline section groups its videos by city").
 *
 * City values are compared case-insensitively with surrounding whitespace trimmed, so trivially
 * different spellings of the same city collapse into one group; the label shown is whichever
 * spelling appeared first. A group's position among the others follows the position of that
 * city's first-appearing pick in the input order, and picks within a group keep their relative
 * order from the input.
 */
export function groupGuidePicksByCity(picks: PublicGuidePick[]): GuidePickCityGroup[] {
  const groups = new Map<string, GuidePickCityGroup>();

  for (const pick of picks) {
    const key = pick.city.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.picks.push(pick);
    } else {
      groups.set(key, { city: pick.city, picks: [pick] });
    }
  }

  return [...groups.values()];
}
