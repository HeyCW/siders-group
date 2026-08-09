import type { Editor, Range } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapImage from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import { VideoNode } from './videoNode.js';
import { SlashCommand } from './slashCommand.js';

/**
 * Adds `caption`, `align`, and a numeric `width` on top of the stock image node — the exact
 * attribute set `sanitizeHtml.ts`'s `renderImage` reads
 * (specs/article-editor/spec.md - "Add a caption to an image", "Insert and resize an image").
 */
export const Image = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: null },
      align: { default: 'center' },
      width: { default: null },
    };
  },
});

export function buildEditorExtensions(handlers: {
  onImageCommand: (props: { editor: Editor; range: Range }) => void;
  onVideoCommand: (props: { editor: Editor; range: Range }) => void;
}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder: "Type '/' for commands..." }),
    Image,
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    CharacterCount,
    VideoNode,
    SlashCommand.configure(handlers),
  ];
}
