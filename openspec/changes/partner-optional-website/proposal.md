## Why

Not every partner organization has a public website worth linking to — some are individuals,
communities, or brands reachable only through social media or offline. Requiring a website URL
today forces the admin to either refuse the partner or type a placeholder/fake URL just to satisfy
validation, and that placeholder then ships as a real, clickable link on the public home page.

## What Changes

- The partner directory's website URL becomes optional at every layer: a partner can be created
  and stored with no website URL.
- The public home page's partner ticker renders a partner with no website URL as a plain,
  non-interactive logo tile (no `<a>`, no `href`, no redirect) instead of a link. A partner that
  has a website URL keeps today's behavior exactly (opens in a new tab).
- The admin partner form no longer requires a website URL to create or save a partner, and no
  longer blocks submission on an empty value — an invalid *non-empty* value (wrong scheme, not an
  absolute URL) is still rejected exactly as today.
- The admin partner list shows a neutral placeholder (e.g. "No website") instead of blank space
  when a partner has no website URL.
- **BREAKING**: `PartnerCreateRequest`, `PartnerUpdateRequest`, `PartnerResponse`, and
  `PublicPartner` (`packages/contracts`) change `websiteUrl` from a required string to an optional
  string. Any existing caller that assumes `websiteUrl` is always present must be updated.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `partner-management`: a partner's website URL is no longer required at creation or update; the
  http(s)-scheme validation rule continues to apply only when a website URL is supplied; the
  public listing serves `websiteUrl` as optional.
- `web-public-site`: a partner tile renders as a link only when the partner has a website URL;
  a partner with none renders as a plain, non-interactive logo tile and is excluded from the
  ticker's keyboard/screen-reader link sequence.

## Impact

- **Database**: `partners.website_url` column becomes nullable (migration required).
- **Contracts** (`packages/contracts/src/partner.ts`): `websiteUrlSchema` becomes optional across
  `partnerCreateRequestSchema`, `partnerUpdateRequestSchema`, `partnerResponseSchema`,
  `publicPartnerSchema`.
- **API** (`apps/api/src/modules/partners/*`): repository/mapper pass `websiteUrl` through as
  nullable/optional rather than assuming a string.
- **Admin** (`apps/admin/src/pages/PartnersPage.tsx`): remove the required-field gating on
  `websiteUrl` for both create and edit forms; render a placeholder when absent in the list.
- **Public web** (`apps/web/components/home/PartnerGrid.tsx`): `PartnerTile` renders an `<a>` only
  when `websiteUrl` is present, otherwise a plain wrapping element with the same layout classes.
- **Tests**: `PartnerGrid.test.tsx`, `PartnersPage.test.tsx`, partner contract tests, and any
  API-side tests asserting `websiteUrl` is required need updating for the optional case.
