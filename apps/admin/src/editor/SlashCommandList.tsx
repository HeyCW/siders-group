import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SlashCommandItem } from './commandItems.js';

export interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * The `/` menu's rendered list, with keyboard navigation exposed via a ref handle — this is the
 * shape `@tiptap/suggestion`'s `render()` lifecycle expects
 * (specs/article-editor/spec.md - "Slash command menu for block insertion").
 */
export const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [props.items]);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % props.items.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-500 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        No matching blocks
      </div>
    );
  }

  return (
    <div className="max-h-80 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      {props.items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
            index === selectedIndex
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-200'
          }`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs dark:border-gray-600">
            {item.icon}
          </span>
          <span>{item.title}</span>
        </button>
      ))}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';
