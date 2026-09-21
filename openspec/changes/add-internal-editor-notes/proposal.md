## Why

Editors have nowhere to leave a note inside a draft. Fact-check reminders, source phone numbers,
"confirm the spelling before this runs", and hand-offs between a writer and a sub-editor currently
live in chat, in a separate doc, or as a paragraph the writer has to remember to delete before
publishing — and sometimes doesn't.

The safe place for those notes is the article body itself, where the sentence they refer to is,
provided they can never reach a reader.

## What Changes

- The editor gains an **Internal note** block, inserted from the slash menu like any other block.
  It renders in the canvas as a marked bullet, visually distinct from body content.
- An internal note appears in the **staff preview**, marked as internal, so an editor reviewing a
  draft sees the notes in context.
- An internal note is **never rendered to a reader**. It is absent from the stored public
  `body_html` entirely — not hidden with CSS, not commented out, not present in the page source.
- **BREAKING (spec only, no stored data changes)**: the staff preview stops being byte-identical
  to the public rendering. Today `GET /admin/articles/{id}/preview` returns the same stored
  `body_html` the public detail endpoint serves; it will instead render the body at request time
  with notes included. The public read path is unchanged.
- A note's text is carried only in `body_json`, which the existing spec already forbids from
  every public response — that rule stops being hygiene and becomes the confidentiality control
  for notes, so this change states it as such.

## Impact

- **Affected specs**: article-editor (1 added, 2 modified), article-management (3 modified)
- **Affected code**:
  - `apps/admin/src/editor/internalNote.ts` (new), `extensions.ts`, `commandItems.ts`
  - `apps/admin/src/components/PreviewModal.tsx`
  - `apps/api-laravel/app/Support/ArticleBodyRenderer.php`,
    `app/Http/Controllers/ArticleController.php`, `app/Support/ArticlePresenter.php`
  - `apps/api/src/lib/sanitizeHtml.ts` and `article.controller.ts` (kept in step with the Laravel
    renderer, per that file's "ported node-for-node" contract)
  - `packages/contracts/src/article.ts` (preview response shape)
- **Migration**: none. No column, no backfill. Existing articles have no note nodes and render
  identically before and after.
