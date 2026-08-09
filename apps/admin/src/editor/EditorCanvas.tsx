import type { Editor, Range } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { buildEditorExtensions } from './extensions.js';
import { BubbleToolbar } from './BubbleToolbar.js';

export interface EditorCanvasProps {
  initialContent: unknown;
  onUpdate: (json: unknown) => void;
  onImageCommand: (props: { editor: Editor; range: Range }) => void;
  onVideoCommand: (props: { editor: Editor; range: Range }) => void;
}

/**
 * The distraction-free writing canvas: a large, centered area with generous whitespace, a
 * floating contextual toolbar on selection, and the `/` slash-command menu — no toolbar chrome
 * visible until the user selects text or places the cursor
 * (specs/article-editor/spec.md - "Distraction-free writing canvas").
 *
 * Lifecycle is left entirely to `useEditor` — it already destroys the editor on unmount
 * internally, so a manual `editor.destroy()` here would just call it a second time.
 */
export function EditorCanvas({ initialContent, onUpdate, onImageCommand, onVideoCommand }: EditorCanvasProps) {
  const editor = useEditor({
    extensions: buildEditorExtensions({ onImageCommand, onVideoCommand }),
    content: (initialContent as never) ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: {
        class:
          'prose prose-lg dark:prose-invert max-w-none min-h-[60vh] focus:outline-none mx-auto py-8',
      },
    },
    onUpdate: ({ editor: currentEditor }) => onUpdate(currentEditor.getJSON()),
  });

  if (!editor) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <BubbleToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
