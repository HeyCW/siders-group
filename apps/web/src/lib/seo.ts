import type { SubBrandPage } from './subBrandPages';

/**
 * Absolute-URL helpers and the structured data shared between the runtime app and the build-time
 * prerender (`scripts/prerender.mjs`).
 *
 * The site is served from a subdirectory, so every absolute URL here carries the `/siders` base —
 * `import.meta.env.BASE_URL` is not usable for this because these strings also have to be correct
 * inside Node during prerendering, and because canonical/`sameAs`/`@id` values must be absolute.
 *
 * Trailing slashes are deliberate. Prerendered routes land on disk as `<slug>/index.html`, so
 * Apache redirects a slashless request to the slashed form; declaring the slashed URL as canonical
 * keeps the declared URL and the finally-served URL identical.
 */
export const SITE_URL = 'https://sidersmedia.com/siders';

/** The home page's Organization node — every sub-brand points back at this exact `@id`. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function subBrandUrl(slug: string): string {
  return `${SITE_URL}/${slug}/`;
}

export function subBrandNodeId(slug: string): string {
  return `${SITE_URL}/#${slug}`;
}

export function assetUrl(filename: string): string {
  return `${SITE_URL}/${filename}`;
}

/**
 * One sub-brand's Organization node, with `sameAs` pointing at its own profiles and
 * `parentOrganization` at the group. The `@id` matches the reference the home page's `@graph`
 * already lists under `subOrganization`, so the two documents describe one entity rather than two.
 */
export function subBrandJsonLd(page: SubBrandPage): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': subBrandNodeId(page.slug),
        name: page.name,
        url: subBrandUrl(page.slug),
        description: page.metaDescription,
        logo: assetUrl(page.logo),
        image: assetUrl(page.logo),
        ...(page.foundingYear ? { foundingDate: String(page.foundingYear) } : {}),
        ...(page.city ? { areaServed: { '@type': 'City', name: page.city } } : {}),
        parentOrganization: { '@id': ORGANIZATION_ID },
        sameAs: page.socials.map((social) => social.href),
      },
      {
        '@type': 'WebPage',
        '@id': `${subBrandUrl(page.slug)}#webpage`,
        url: subBrandUrl(page.slug),
        name: page.title,
        description: page.metaDescription,
        inLanguage: 'id-ID',
        about: { '@id': subBrandNodeId(page.slug) },
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${subBrandUrl(page.slug)}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${subBrandUrl(page.slug)}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Siders', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: page.name, item: subBrandUrl(page.slug) },
        ],
      },
    ],
  };
}
