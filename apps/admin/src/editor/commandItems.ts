import type { Editor, Range } from '@tiptap/core';

export interface SlashCommandItem {
  title: string;
  icon: string;
  keywords: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

/**
 * The full block-insertion menu (specs/article-editor/spec.md - "Typing `/` at the start of an
 * empty line SHALL open a searchable menu of insertable block types: heading, quote, code
 * block, ordered list, unordered list, checklist, table, image, divider, video embed").
 *
 * `onImageCommand` and `onVideoCommand` are supplied by the editor page, since inserting an
 * image goes through the media upload endpoint (specs/article-editor/spec.md - "Image insertion
 * uploads through the media endpoint") and inserting a video prompts for a URL — neither is a
 * pure editor-transaction concern.
 */
export function buildCommandItems(handlers: {
  onImageCommand: (props: { editor: Editor; range: Range }) => void;
  onVideoCommand: (props: { editor: Editor; range: Range }) => void;
}): SlashCommandItem[] {
  return [
    {
      title: 'Heading 1',
      icon: 'H1',
      keywords: ['heading', 'h1', 'title'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      icon: 'H2',
      keywords: ['heading', 'h2', 'subtitle'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      icon: 'H3',
      keywords: ['heading', 'h3'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      title: 'Quote',
      icon: '"',
      keywords: ['quote', 'blockquote'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
    },
    {
      title: 'Code Block',
      icon: '</>',
      keywords: ['code', 'codeblock'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCodeBlock().run(),
    },
    {
      title: 'Ordered List',
      icon: '1.',
      keywords: ['ordered', 'numbered', 'list'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: 'Bullet List',
      icon: '•',
      keywords: ['bullet', 'unordered', 'list'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: 'Checklist',
      icon: '☑',
      keywords: ['checklist', 'todo', 'task'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: 'Table',
      icon: '▦',
      keywords: ['table', 'grid'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: 'Image',
      icon: '🖼',
      keywords: ['image', 'picture', 'photo', 'upload'],
      command: (props) => handlers.onImageCommand(props),
    },
    {
      title: 'Divider',
      icon: '—',
      keywords: ['divider', 'hr', 'horizontal', 'rule'],
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: 'Video',
      icon: '▶',
      keywords: ['video', 'embed', 'youtube', 'vimeo'],
      command: (props) => handlers.onVideoCommand(props),
    },
  ];
}
