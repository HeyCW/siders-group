## Context

`partners.website_url` is `NOT NULL` (`packages/db/src/schema/partners.ts`), required in
`partnerCreateRequestSchema`/`partnerUpdateRequestSchema` (`packages/contracts/src/partner.ts`),
and always serialized as a plain string in `partnerResponseSchema`/`publicPartnerSchema`. The
public renderer, `PartnerTile` in `apps/web/components/home/PartnerGrid.tsx`, unconditionally
wraps every logo in `<a href={partner.websiteUrl}>`. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Allow a partner to exist with no website URL, end to end (DB → API → admin → public site).
- Preserve every existing behavior for a partner that does have a website URL.
- Keep the http(s)-scheme validation rule exactly as strict as today whenever a value is supplied.

**Non-Goals:**
- No change to how partners are ordered, activated/deactivated, or reordered.
- No change to the logo requirement — a logo stays mandatory.
- No new placeholder/fallback URL (e.g. `#`) — absence is represented as absence, not a dead link.

## Decisions

**DB column: nullable, no default.** Drop `.notNull()` from `websiteUrl` in
`packages/db/src/schema/partners.ts` and ship a migration that alters the column to allow `NULL`.
No backfill needed — existing rows already carry real URLs. Empty string is never stored; the API
layer normalizes an empty/whitespace submission to `null` before persisting (mirrors how
`name`/`logoMediaId` are trimmed elsewhere in this module).

**Contracts: `websiteUrlSchema.nullable().optional()`, matching `featuredMediaId`'s existing
pattern.** `create`, `update`, `partnerResponseSchema`, and `publicPartnerSchema` all use the same
`websiteUrl: websiteUrlSchema.nullable().optional()` shape — the same
"absent = don't touch / not present, `null` = explicitly none, string = a value" convention
`articleWriteFieldsSchema.featuredMediaId` already uses in this codebase
(`packages/contracts/src/article.ts`). This matters specifically for **update**: `undefined`
(field omitted) must mean "leave the stored website URL as it is", while a partner's website being
*cleared* needs a distinct signal — `null`. Using `.optional()` alone (no `.nullable()`) cannot
express that distinction. The DB column is nullable text, so `null` flows straight through
`apps/api/src/modules/partners/partner.mapper.ts` with no conversion — the mapper passes
`row.websiteUrl` through unchanged, exactly like `featuredMediaId`/`excerpt`-style nullable
fields elsewhere in this module.

**Validation stays on the shared schema.** `websiteUrlSchema` (the `.url().refine(isHttpUrl, ...)`
chain) is unchanged in isolation; only its point of attachment gains `.nullable().optional()`. An
empty/whitespace string is not a meaningful value to validate as a URL, so it is not sent to the
API as a string at all: the **admin form** (the only producer of this field) normalizes a
blank/whitespace-only input to `null` before building the request body — for create, `null` means
"no website"; for update, `null` means "clear the stored website". This keeps the URL-format
validation rule itself simple (it only ever sees `null`, `undefined`, or a non-empty candidate
string) and keeps the empty-vs-clear decision where the user's intent is actually expressed.

**Public rendering: conditional anchor, not a disabled/greyed link.** `PartnerTile` branches on
`partner.websiteUrl` presence: with a URL, render exactly today's `<a>`; without one, render a
`<span>`/`<div>` carrying the same layout classes so the ticker's sizing and marquee math are
unaffected, with no `role="link"`, no `tabIndex`, and no `href`. This is what keeps a linkless
partner out of the tab sequence per the `web-public-site` delta, without adding an
`aria-disabled` link that assistive tech would still announce as interactive.

**Admin form: remove the requiredness gate, keep the format gate, send `null` for a blank field.**
`canCreate`/`canSaveEdit` in `apps/admin/src/pages/PartnersPage.tsx` drop the
`websiteUrl.trim().length > 0` clause but keep `websiteUrlIsInvalid`/`editWebsiteUrlIsInvalid`
(already defined as "non-empty and invalid", so an empty field never trips them). Both `create` and
`update` calls send `websiteUrl: websiteUrl.trim() || null` — a blank field becomes `null`, which
means "no website" on create and "clear the website" on update, matching the schema decision above.
The list view shows `partner.websiteUrl ?? 'No website'` in place of the current unconditional
`{partner.websiteUrl}`.

## Risks / Trade-offs

- **Breaking contract change** (already called out in proposal.md as BREAKING): any other consumer
  of `PublicPartner`/`PartnerResponse` that assumes `websiteUrl: string` needs a type-level update.
  Mitigation: this repo is the only consumer (`apps/web`, `apps/admin`); grep for `.websiteUrl`
  usages as part of implementation to catch every call site in the same change.
- **Existing tests assert `websiteUrl` is always present** (contract tests, `PartnerGrid.test.tsx`,
  `PartnersPage.test.tsx`, API service/repository tests). These need updating alongside the schema
  change rather than after, or the change ships with a red suite.

## Migration Plan

1. Add a DB migration dropping the `NOT NULL` constraint on `partners.website_url` (no data
   migration required — nullable is a strict widening of the existing column).
2. Update `packages/contracts` schemas and regenerate any generated types the workspace relies on.
3. Update the API mapper/repository and admin/web consumers in the same change, so nothing in the
   tree is left assuming the old required shape.
4. No rollback complexity: reverting the migration (re-adding `NOT NULL`) is safe as long as no
   partner has been saved without a website URL in the interim; call this out to whoever deploys if
   a rollback is ever needed after real data has used the new optionality.
