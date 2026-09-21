import { Node, mergeAttributes } from '@tiptap/core';

/**
 * A block-level note an editor writes for other staff — visible in the canvas and in the staff
 * preview, never in public output (specs/article-editor/spec.md - "Internal note block").
 * `content: 'inline*'` matches a paragraph's content model, so `setNode('internalNote')` from
 * the slash command converts the current line the same way heading conversion does.
 *
 * The "Internal note" label is pure CSS (`.internal-note::before` in `index.css`), not a DOM
 * node inside the content hole — so it can never be selected, deleted, or accidentally become
 * part of the stored document content, and the same rule styles both the live canvas and the
 * server-rendered staff preview with nothing to keep in sync between them.
 *
 * Public safety does not come from anything in this file: the allowlist renderers
 * (`sanitizeHtml.ts` / `ArticleBodyRenderer.php`) only emit this node's content in preview mode,
 * and drop it entirely — by the same deny-by-default path as any node type they were never
 * taught — everywhere else (design.md - "Public safety comes from the renderer's
 * deny-by-default, not from a strip step").
 */
export const InternalNote = Node.create({
  name: 'internalNote',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'aside[data-internal-note]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-internal-note': 'true', class: 'internal-note' }), 0];
  },
});
