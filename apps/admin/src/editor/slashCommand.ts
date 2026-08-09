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

          return {
            onStart: (props) => {
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
              component.updateProps({ items: props.items as SlashCommandItem[], command: props.command });
              if (!props.clientRect) return;
              popup[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup[0]?.hide();
                return true;
              }
              return component.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup[0]?.destroy();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});
