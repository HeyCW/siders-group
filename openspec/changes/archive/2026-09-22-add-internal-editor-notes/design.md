## Context

Today the staff preview and the public page render the *same bytes*. `ArticleController::preview`
returns `ArticlePresenter::public($article)`, whose `bodyHtml` is the stored `articles.body_html`
column; `PreviewModal` injects that string. The public detail endpoint returns the same field from
the same column. There is exactly one rendering of an article body in this system.

`ArticleBodyRenderer` (and its node-for-node twin `sanitizeHtml.ts`) walks the ProseMirror document
and emits HTML itself, one branch per allowlisted node type, with `default => ''` for anything it
was never taught. It never parses untrusted HTML.

`article-management`'s "Server-side content sanitization" currently states that **every** read,
"admin or public", returns the stored `body_html` without re-running the sanitizer. A preview that
shows something the public rendering does not therefore cannot be built without amending that
requirement — which is why this change touches three `article-management` requirements rather than
only adding an editor block.

## Goals / Non-Goals

**Goals:**
- A note can never reach a reader, by construction rather than by a filter someone must remember
  to apply.
- A note is visible where it is useful: in the draft canvas, and in the preview an editor reviews
  before publishing.
- No second stored copy of the body that can drift from the first.

**Non-Goals:**
- Comments, threads, replies, mentions, or resolve/unresolve state. This is a note in the text,
  not a review workflow.
- Per-note authorship or timestamps. The note is plain body content; git-style attribution is a
  much larger feature and nothing here forecloses it.
- Showing notes to readers under any condition, for any role.

## Decisions

### Public safety comes from the renderer's deny-by-default, not from a strip step

`renderNode`'s `default => ''` already drops any node type it does not recognize. A note node
added to the document today — before any renderer change — would already be absent from
`body_html`. This change therefore does not add a "remove the notes" pass to the public path; it
adds a *preview* path that opts the note type **in**.

That direction matters. A strip step is a filter that can be forgotten, mis-ordered, or bypassed
by a new code path; deny-by-default fails closed. The public rendering stays exactly what it is
today: the set of node types the renderer was explicitly taught to emit, with notes not among
them.

### The preview renders at request time; there is no second stored column

*Rejected:* a `body_html_preview` column written alongside `body_html` at save time. It keeps the
"render on write" discipline for both outputs, but it stores every note's text a second time, in a
column whose name does not say "staff only", and creates two representations that can silently
drift when only one write path is updated. A future query that grabs "the body html" and picks the
wrong column leaks the notes.

*Chosen:* `GET /admin/articles/{id}/preview` renders from `body_json` at request time, through the
same `ArticleBodyRenderer`, in a mode that emits the note node. This:

- keeps `body_html` — the only body string any public path can reach — provably note-free;
- adds no column, no migration, and no second copy to keep in sync;
- exposes nothing new: the preview endpoint is already `permission:news.manage`, and `body_json`
  is already returned in full by the admin article read.

The cost is one render per preview request, on a staff-only endpoint that is hit when a human
clicks "Preview". The "sanitize on write, not on read" rule exists so the *public* read path never
re-runs the renderer — that path is untouched here.

### `body_json` secrecy becomes load-bearing

"Only sanitized HTML is served publicly" already forbids `body_json` in public responses. Once
notes exist, that requirement is the only thing standing between a note and a reader, so this
change restates it with notes named explicitly and adds a scenario for it. Nothing about the rule
changes; what changes is that breaking it now leaks editorial commentary, not just implementation
detail.

### The note is a block, not a mark

A mark (like bold) can span part of a sentence, which would mean a public rendering with a hole in
the middle of a paragraph — the surrounding sentence would read as if the marked words were never
there, and an editor would have to imagine the gap. A block-level node removes cleanly: the
paragraph before and after it are untouched, and what the reader sees is exactly the document with
that block deleted.
