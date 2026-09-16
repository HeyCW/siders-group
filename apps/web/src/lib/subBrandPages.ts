/**
 * The three anak usaha, as standalone pages rather than tiles on the home page.
 *
 * Each page is deliberately short: a heading, one sentence defining the brand, and its profile
 * links. This file is the single source for all of it — the copy, the `<title>`/`<h1>` pair, and
 * the social profiles that become each page's `sameAs`. It is deliberately plain data
 * with no JSX so `scripts/prerender.mjs` can render these routes to real HTML at build time —
 * see that script for why crawler-visible HTML is the whole point of splitting these out.
 *
 * Social URLs mirror apps/api-laravel/database/seeders/AnakUsahaSeeder.php, with tracking params
 * (`igsh`, `_t`, `_r`) stripped: `sameAs` has to be the canonical profile URL, not a share link.
 *
 * `foundingYear` is intentionally absent on every entry. It belongs in the copy and in each
 * page's `foundingDate`, but nobody has supplied the real years yet and an invented one is worse
 * than a missing one. Fill it in and both the page and its schema pick it up automatically.
 */

export interface SubBrandSocial {
  label: string;
  href: string;
  handle: string;
}

export interface SubBrandPage {
  slug: string;
  name: string;
  /** The `<title>`. Leads with the brand name so it matches the keyword it targets. */
  title: string;
  metaDescription: string;
  kind: string;
  /** The opening "X adalah ..." sentence — the explicit definition crawlers and readers both want. */
  lead: string;
  /** Matches a file in `public/`, resolved against `import.meta.env.BASE_URL` at render time. */
  logo: string;
  city?: string;
  foundingYear?: number;
  socials: SubBrandSocial[];
}

export const SUB_BRAND_PAGES: SubBrandPage[] = [
  {
    slug: 'surabaya-siders',
    name: 'Surabaya Siders',
    title: 'Surabaya Siders — Media Lokal Surabaya',
    metaDescription:
      'Surabaya Siders adalah media lokal Surabaya yang mengangkat kuliner, lifestyle, tempat menarik, dan tren yang sedang ramai di kota. Bagian dari Siders Group.',
    kind: 'Media Platform',
    city: 'Surabaya',
    lead: 'Surabaya Siders adalah media lokal Surabaya yang mengangkat cerita dan perkembangan kota, mulai dari kuliner, lifestyle, tempat menarik, hingga tren yang sedang ramai dibicarakan warganya.',
    logo: 'surabaya-siders-bulat.png',
    socials: [
      {
        label: 'Instagram',
        handle: '@surabayasiders',
        href: 'https://www.instagram.com/surabayasiders',
      },
      {
        label: 'TikTok',
        handle: '@surabaya.siders',
        href: 'https://www.tiktok.com/@surabaya.siders',
      },
    ],
  },
  {
    slug: 'jakarta-siders',
    name: 'Jakarta Siders',
    title: 'Jakarta Siders — Media Lokal Jakarta',
    metaDescription:
      'Jakarta Siders adalah media lokal Jakarta yang mengeksplorasi lifestyle, kuliner, entertainment, dan tren kota. Bagian dari Siders Group.',
    kind: 'Media Platform',
    city: 'Jakarta',
    lead: 'Jakarta Siders adalah media lokal Jakarta yang mengeksplorasi kehidupan dan dinamika ibu kota, dari lifestyle, kuliner, entertainment, sampai tempat dan tren yang sedang jadi perhatian.',
    logo: 'jakarta-siders-bulat.png',
    socials: [
      {
        label: 'Instagram',
        handle: '@jakarta_siders',
        href: 'https://www.instagram.com/jakarta_siders',
      },
      {
        label: 'TikTok',
        handle: '@jakartasiders',
        href: 'https://www.tiktok.com/@jakartasiders',
      },
    ],
  },
  {
    slug: 'siders-vox',
    name: 'Siders Vox',
    title: 'Siders Vox — Media Opini dan Suara Anak Muda',
    metaDescription:
      'Siders Vox adalah platform media yang menghadirkan perspektif, opini, dan cerita dari suara generasi muda, mulai dari isu sosial sampai lifestyle. Bagian dari Siders Group.',
    kind: 'News & Community',
    lead: 'Siders Vox adalah platform media yang menghadirkan perspektif, opini, dan cerita dari suara generasi muda, membahas isu sosial, lifestyle, hingga topik yang dekat dengan kehidupan sehari-hari.',
    logo: 'siders-vox-bulat.png',
    socials: [
      { label: 'Instagram', handle: '@sidersvox', href: 'https://www.instagram.com/sidersvox' },
    ],
  },
];

export function findSubBrandPage(slug: string | undefined): SubBrandPage | undefined {
  return SUB_BRAND_PAGES.find((page) => page.slug === slug);
}

/**
 * Matches a brand by display name, so the home page can link its tiles here without storing a
 * slug alongside every one of them.
 *
 * Comparison strips everything that is not a letter or digit, because the same brand is written
 * three different ways across the codebase — `SidersVox` in the hardcoded logo row, `Siders Vox`
 * in the database seeder, `siders-vox` as the slug — and all three should resolve to one page.
 * A name with no page (a brand added to the database but not here) simply gets no link.
 */
export function findSubBrandPageByName(name: string): SubBrandPage | undefined {
  const key = normalizeBrandKey(name);
  return SUB_BRAND_PAGES.find((page) => normalizeBrandKey(page.slug) === key);
}

function normalizeBrandKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
