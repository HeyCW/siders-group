## 1. Editor content model

- [x] 1.1 Added `apps/admin/src/editor/internalNote.ts`: block-level Tiptap node (`internalNote`,
      `group: 'block'`, `content: 'inline*'`), following `videoNode.ts`'s structure
- [x] 1.2 Registered in `buildEditorExtensions` (`extensions.ts`)
- [x] 1.3 Styled via `.siders-scope .internal-note` in `index.css` — a bordered, tinted box using
      the existing `--signal`/`--signal-soft` design tokens, with a CSS-generated "Internal note"
      label (`::before`) rather than a DOM node inside the editable content, so the label can
      never be selected/edited/copied as if it were the note's own text
- [x] 1.4 Added "Internal note" to `buildCommandItems` — icon `⚑`, keywords
      `['note', 'internal', 'todo', 'editor', 'flag']`

## 2. Renderer (both backends, kept node-for-node identical)

- [x] 2.1 `ArticleBodyRenderer::render()` (and TS `sanitizeHtml()`) gained a `$mode`/`mode`
      parameter, `'public'` by default. `internalNote`'s `match`/`switch` arm is
      `mode === 'preview' ? renderInternalNote(...) : ''` — public mode collapses to exactly the
      same empty string the `default` arm already produces for any unrecognized type
- [x] 2.2 Preview mode renders `<aside class="internal-note" data-internal-note="true">…</aside>`;
      children go through the same `renderChildren`/inline text-and-marks path as every other
      block, so escaping and mark rendering inside a note are identical to anywhere else
- [x] 2.3 Mirrored in `apps/api/src/lib/sanitizeHtml.ts` — every function that recurses into
      `renderNode` (`renderChildren`, `renderTableCell`, `renderHeading`, `renderOrderedList`,
      `renderTaskItem`) now threads `mode` through, matching the PHP side arm for arm
- [x] 2.4 Confirmed: `sanitizeHtml`/`ArticleBodyRenderer::render` default to `'public'`, so every
      existing call site (article create/update's stored `body_html`, the public detail/list
      mappers) is unchanged; only `toPreviewResponse` / `ArticlePresenter::preview` pass
      `'preview'`

## 3. Preview endpoint

- [x] 3.1 `ArticleController::preview` now calls `ArticlePresenter::preview($article)`, which
      renders `body_html` fresh from `body_json` in preview mode
- [x] 3.2 `ArticlePresenter::preview()` spreads `public()`'s full result and overrides only
      `bodyHtml` — every other field (categories, anakUsaha, authorName, seo*, …) is identical to
      `public()`'s
- [x] 3.3 Mirrored: `apps/api`'s `toPreviewResponse` now builds `bodyHtml` via
      `sanitizeHtml(article.bodyJson, 'preview').html` instead of reading `article.bodyHtml`
- [x] 3.4 Confirmed: `toPublicDetail`/`toPublicCard` (Node) and `ArticlePresenter::public()`
      (Laravel) are untouched — both still read the stored `body_html` column directly, never
      re-rendering; `cardExcerpt`'s HTML-derived excerpt fallback also reads the stored (public,
      note-free) `bodyHtml`, so it carries no leak risk by construction

## 4. Preview UI

- [x] 4.1 `.internal-note` styling in `index.css` is shared by the canvas and `PreviewModal` —
      both wrap content in `.prose` inside `.siders-scope`, so one rule covers both surfaces with
      nothing to keep in sync between them
- [x] 4.2 Updated `PreviewModal`'s doc comment: `bodyHtml` is server-generated as before, but is
      no longer byte-identical to the public rendering — an article with no notes previews
      identically to its public page, one with notes does not, and that difference is the point

## 5. Verification

- [x] 5.1 Renderer tests, both backends (`sanitizeHtml.test.ts` +5,
      `ArticleBodyRendererTest.php` +5): absent in default/explicit-public mode with surrounding
      blocks intact, present in preview mode, marks/escaping applied inside a note the same as
      elsewhere, and — an extra case beyond the original plan — a note nested inside another
      block type (blockquote) never leaks into that block's public output
- [x] 5.2 `article.mapper.test.ts` (new): `toPublicDetail` returns the stored, note-free
      `body_html` unchanged even when handed a `bodyJson` that (inconsistently) still carries a
      note — the public path never re-renders, so it can't be made to disclose one. The excerpt
      fallback needed no separate test: `cardExcerpt`/Laravel's `excerpt` field never read from a
      note-inclusive render in the first place (see 3.4)
- [~] 5.3 Editor tests (insert via slash menu, persists across save/reload, delete leaves
      neighbours intact) — **not added**. This codebase has no existing Tiptap-node-level test of
      any kind (`videoNode.ts`, headings, etc. are all untested at that layer);
      `ArticleEditPage.test.tsx` stubs `EditorCanvas` out entirely and tests only the page's own
      orchestration. Adding node-level Tiptap tests here would introduce a testing pattern this
      codebase doesn't otherwise use; the content-model round trip (insert → persisted structure →
      rendered) is instead covered by the renderer tests in 5.1, which verify what an
      `internalNote` node of this shape produces once it reaches the server.
- [x] 5.4 `tests/Feature/ArticleInternalNotePreviewTest.php` (new, mirrors the
      `HyperlocalSpotlightTest.php` fixture pattern): a note appears in the preview response for
      an Owner-role staff member; the preview endpoint is `403` without `news.manage` and `401`
      unauthenticated; the public detail and public list endpoints never contain the note text or
      the `internal-note` marker; an article with no notes previews byte-identical to its public
      rendering
- [~] **Could not execute** `ArticleInternalNotePreviewTest.php` in this sandbox — same pre-existing
      SQLite incompatibility documented for `add-hyperlocal-spotlight`: every migration's
      `CURRENT_TIMESTAMP(3)` column default is invalid SQLite syntax, so any `RefreshDatabase`
      test fails on the very first migration (`roles`) regardless of this change. Confirmed by
      running the file — it fails at exactly that step, before any of this change's code runs.
      `ArticleBodyRendererTest.php` (pure Unit, no DB) *did* run and passes in full — see 5.1.
- [~] `ArticlePresenter::preview()` has no dedicated unit test of its own (only exercised via the
      Feature test above, which can't run here) — it is a two-line function (spread `public()`,
      override `bodyHtml`), and the substantive logic it depends on
      (`ArticleBodyRenderer::render(..., 'preview')`) is fully covered by 5.1.
- [x] 5.6 Verification run in this sandbox: `php -l` and `./vendor/bin/pint --test` clean on every
      touched/added PHP file; `php artisan test --testsuite=Unit` 24/24 passing (includes the 5 new
      cases); `RouteAuthorizationAuditTest` unaffected (no new routes in this change).
      `pnpm --filter @siders/api run typecheck` and `pnpm --filter @siders/admin run typecheck`
      clean; `pnpm eslint` clean on every touched TS/TSX file; `pnpm --filter @siders/api exec
      vitest run` 553/556 passing (549+4 new; 3 skipped mysql-integration, pre-existing).
