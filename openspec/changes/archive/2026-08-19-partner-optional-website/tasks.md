## 1. Database

- [x] 1.1 Drop `.notNull()` from `websiteUrl` in `packages/db/src/schema/partners.ts`
- [x] 1.2 Run `pnpm --filter @siders/db db:generate` to emit the migration into `supabase/migrations`, and check in the generated SQL

## 2. Contracts

- [x] 2.1 In `packages/contracts/src/partner.ts`, change `websiteUrl` to `websiteUrlSchema.optional()` in `partnerCreateRequestSchema`, `partnerResponseSchema`, and `publicPartnerSchema` (it is already optional in `partnerUpdateRequestSchema`)
- [x] 2.2 Update `packages/contracts/src/partner.test.ts` to cover: create/update without a website URL succeeds; an explicit `null` website URL is accepted (absent vs. clear); the http(s)-scheme rule still rejects an invalid non-empty value

## 3. API

- [x] 3.1 In `apps/api/src/modules/partners/partner.repository.ts`, widen `PartnerRow`/`CreatePartnerInput`/`UpdatePartnerInput.websiteUrl` to `string | null` (nullable, matching the DB column); `partner.mapper.ts` needed no change since both the row and the contract types are now `string | null`
- [x] 3.2 Update `apps/api/src/modules/partners/partner.service.test.ts` to cover: creating a partner with no website URL; clearing an existing website URL via explicit `null` on update; an omitted `websiteUrl` on update leaves the stored value unchanged

## 4. Admin UI

- [x] 4.1 In `apps/admin/src/pages/PartnersPage.tsx`, remove the `websiteUrl.trim().length > 0` clause from `canCreate` and `canSaveEdit` (keep the invalid-format checks); relabel both fields "Website URL (optional)"; `handleCreate`/`handleSaveEdit` send `websiteUrl.trim() || null`; `startEdit` seeds the field from `partner.websiteUrl ?? ''`
- [x] 4.2 Render `partner.websiteUrl ?? 'No website'` in the partner list row in place of the current unconditional `{partner.websiteUrl}`
- [x] 4.3 Update `apps/admin/src/pages/PartnersPage.test.tsx` to cover: creating a partner with the website field left empty sends `null`; clearing an existing website on edit sends `null` and is not blocked; the list shows "No website" for such a partner; an invalid non-empty URL still blocks submission on both create and edit

## 5. Public web

- [x] 5.1 In `apps/web/components/home/PartnerGrid.tsx`, change `PartnerTile` to render an `<a href={partner.websiteUrl} target="_blank" rel="noopener noreferrer">` only when `partner.websiteUrl` is present, and otherwise render a `<span>` with the same `className`, no `href`
- [x] 5.2 Update `apps/web/components/home/PartnerGrid.test.tsx` to cover: a partner with no website URL renders with no anchor and is excluded from `getAllByRole('link')` in both the ticker and reduced-motion grid; a partner with a website URL in the same mixed list is unaffected

## 6. Verification

- [x] 6.1 Run the full test suite (`apps/web`, `apps/admin`, `apps/api`, `packages/contracts`) and fix any remaining assertion that assumed `websiteUrl` is always a non-empty string — 104 files / 928 tests pass
- [x] 6.2 Run `pnpm typecheck` across the workspace to catch any consumer of `PublicPartner`/`PartnerResponse`/`PartnerCreateRequest` left assuming `websiteUrl: string` — found and fixed one `exactOptionalPropertyTypes` gap in `partner.repository.ts`'s insert (`input.websiteUrl ?? null`); all packages now typecheck clean
- [x] 6.3 Applied the generated migration to the dev DB (`pnpm --filter @siders/db db:migrate` — succeeded) and confirmed `GET /partners` still serves correctly post-migration. Full click-through of the admin UI (create a partner with no website, confirm the home page renders it as a non-clickable logo) was not performed live in this session — no browser tooling was available — and is left for the user to spot-check; behavior is otherwise covered end-to-end by the automated suite (928 tests, including `PartnerGrid.test.tsx`'s no-link/mixed-partner cases and `PartnersPage.test.tsx`'s create/clear-with-null cases)
