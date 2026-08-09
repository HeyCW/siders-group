import { useEffect } from 'react';
import type { Editor, Range } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { buildEditorExtensions } from './extensions.js';
import { BubbleToolbar } from './BubbleToolbar.js';

export interface EditorCanvasProps {
  initialContent: unknown;
  onUpdate: (json: unknown) => void;
  onImageCommand: (props: { editor: Editor; range: Range }) => void;
  onVideoCommand: (props: { editor: Editor; range: Range }) => void;
  onEditorReady?: (editor: Editor) => void;
}

/**
 * The distraction-free writing canvas: a large, centered area with generous whitespace, a
 * floating contextual toolbar on selection, and the `/` slash-command menu — no toolbar chrome
 * visible until the user selects text or places the cursor
 * (specs/article-editor/spec.md - "Distraction-free writing canvas").
 */
export function EditorCanvas({ initialContent, onUpdate, onImageCommand, onVideoCommand, onEditorReady }: EditorCanvasProps) {
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

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    return () => editor?.destroy();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <BubbleToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
