## 1. Static content

- [x] 1.1 Add `mapQuery: 'Jalan Raya Darmo, Surabaya'` to `CONTACT_INFO` in `apps/web/lib/content.tsx`

## 2. Map component

- [x] 2.1 Create `apps/web/components/contact/ContactMap.tsx` as a Server Component rendering an `<iframe>` with `src="https://maps.google.com/maps?q=<encoded mapQuery>&output=embed"`, `loading="lazy"`, and a descriptive `title`
- [x] 2.2 Accept `query: string` as a prop (do not import `CONTACT_INFO` directly inside the component) and `encodeURIComponent` it into the `src`

## 3. Contact page wiring

- [x] 3.1 In `apps/web/app/contact/page.tsx`, replace the `MediaSlot` placeholder in the "Find us" section with `<ContactMap query={CONTACT_INFO.mapQuery} />`
- [x] 3.2 Change the section's wrapper className from `aspect-[21/9]` to `aspect-[4/3] md:aspect-[21/9]`

## 4. Verification

- [x] 4.1 Run `pnpm --filter @siders/web typecheck`
- [ ] 4.2 Run the web app locally and visually confirm the map renders on `/contact` at both mobile and desktop widths, and that no request goes to `apps/api` for map data
- [x] 4.3 Run existing web test suite to confirm no regressions (`pnpm --filter @siders/web test` if configured)
