import { Node, mergeAttributes } from '@tiptap/core';

/**
 * A minimal embedded-video node: `{ type: 'video', attrs: { src } }`. Matches exactly what
 * `apps/api/src/lib/sanitizeHtml.ts`'s allowlist renderer expects — that file renders it as an
 * inert link, never an `<iframe>`, so this node only needs to carry the URL
 * (specs/article-editor/spec.md - "Supported content blocks": "optionally embedded videos by URL").
 */
export const VideoNode = Node.create({
  name: 'video',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-video-src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-video-src': HTMLAttributes.src }), HTMLAttributes.src];
  },
});
