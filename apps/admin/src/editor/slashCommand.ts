import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { SlashCommandList, type SlashCommandListHandle } from './SlashCommandList.js';
import { buildCommandItems, type SlashCommandItem } from './commandItems.js';

export interface SlashCommandOptions {
  onImageCommand: (props: { editor: Editor; range: Range }) => void;
  onVideoCommand: (props: { editor: Editor; range: Range }) => void;
}

/**
 * Typing `/` at the start of an empty line opens a searchable block-insertion menu; selecting
 * an entry replaces the `/` trigger with the chosen block
 * (specs/article-editor/spec.md - "Slash command menu for block insertion").
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onImageCommand: () => undefined,
      onVideoCommand: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: true,
        items: ({ query }: { query: string }) => {
          const items = buildCommandItems(options);
          if (!query) return items;
          const lower = query.toLowerCase();
          return items.filter(
            (item) => item.title.toLowerCase().includes(lower) || item.keywords.some((k) => k.includes(lower)),
          );
        },
        command: ({ editor, range, props }) => {
          (props as SlashCommandItem).command({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListHandle>;
          let popup: TippyInstance[] = [];
          /**
           * Hiding the tippy popup on Escape only hides the *visual* menu — `@tiptap/suggestion`
           * keeps tracking the `/query` range underneath until it exits on its own (e.g. the
           * trigger character is deleted), so without this a subsequent Enter still reached
           * `component.ref.onKeyDown` and silently inserted whatever block was last highlighted
           * (specs/article-editor/spec.md - "Dismiss slash menu").
           *
           * Stored as the dismissed range's start position rather than a bare boolean: the
           * suggestion plugin fires neither `onStart` nor `onExit` when the caret moves between
           * two active triggers whose query text is identical (`moved && !changed` — only
           * `onUpdate` runs), so a boolean set on line A's `/im` would still be set when the
           * user clicked into line B's `/im`, leaving that menu invisible and inert. Comparing
           * positions means a different trigger is never treated as the dismissed one.
           */
          let dismissedAt: number | null = null;

          return {
            onStart: (props) => {
              dismissedAt = null;
              component = new ReactRenderer(SlashCommandList, {
                props: { items: props.items as SlashCommandItem[], command: props.command },
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate(props) {
              // A move to a different trigger clears the dismissal, and re-shows the menu the
              // plugin never restarted for us.
              if (dismissedAt !== null && dismissedAt !== props.range.from) {
                dismissedAt = null;
                popup[0]?.show();
              }
              if (dismissedAt !== null) return;
              component.updateProps({ items: props.items as SlashCommandItem[], command: props.command });
              if (!props.clientRect) return;
              popup[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                dismissedAt = props.range.from;
                popup[0]?.hide();
                return true;
              }
              if (dismissedAt !== null) return false;
              return component.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              dismissedAt = null;
              popup[0]?.destroy();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});
