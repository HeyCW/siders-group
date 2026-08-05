## Purpose

Defines the admin writing experience for long-form articles: a distraction-free canvas, contextual formatting controls, block insertion, and the keyboard-first workflow it must support.

## ADDED Requirements

### Requirement: Distraction-free writing canvas
The editor SHALL present a large, centered writing canvas with generous whitespace, separated from a distinct title field, and SHALL keep formatting controls hidden until the user selects text or places the cursor in the content area.

#### Scenario: No selection, no cursor focus
- **WHEN** the editor loads and the user has not clicked into or selected any content
- **THEN** no formatting toolbar is visible

#### Scenario: Text selected
- **WHEN** the user selects one or more characters of article content
- **THEN** a floating contextual formatting toolbar appears anchored to the selection

### Requirement: Floating contextual formatting toolbar
When content is selected, the editor SHALL show a floating toolbar offering at minimum: bold, italic, underline, strikethrough, link, and heading-level controls, and SHALL dismiss when the selection is cleared.

#### Scenario: Apply bold via toolbar
- **WHEN** the user selects text and clicks the toolbar's bold control
- **THEN** the selected text is rendered bold and the underlying content model marks it as bold

#### Scenario: Selection cleared
- **WHEN** the user clicks outside the current selection or collapses it
- **THEN** the floating toolbar is hidden

### Requirement: Slash command menu for block insertion
Typing `/` at the start of an empty line SHALL open a searchable menu of insertable block types (heading, quote, code block, ordered list, unordered list, checklist, table, image, divider, video embed). Selecting an entry SHALL replace the `/` trigger with the chosen block.

#### Scenario: Insert a heading via slash command
- **WHEN** the user types `/` on an empty line, types "heading", and selects "Heading 2"
- **THEN** the current line becomes an H2 block and the `/` query text is removed

#### Scenario: Dismiss slash menu
- **WHEN** the slash menu is open and the user presses Escape
- **THEN** the menu closes and the `/` character remains as plain text

### Requirement: Supported content blocks
The editor SHALL support creating and editing: paragraphs; headings H1-H3; bold, italic, underline, and strikethrough marks; links; block quotes; code blocks; ordered and unordered lists; checklists; tables; images with optional captions, resizing, and alignment (left, center, right); horizontal dividers; and optionally embedded videos by URL.

#### Scenario: Insert and resize an image
- **WHEN** the user inserts an image block and drags its resize handle
- **THEN** the image's stored width updates and its aspect ratio is preserved

#### Scenario: Add a caption to an image
- **WHEN** the user types text into an image block's caption field
- **THEN** the caption text is persisted as part of that image block

#### Scenario: Build a checklist
- **WHEN** the user inserts a checklist block and adds items, checking one of them
- **THEN** that item is persisted with a checked state distinct from unchecked items

### Requirement: Keyboard-first workflow
The editor SHALL support common keyboard shortcuts for formatting and block operations (at minimum: bold, italic, underline, undo, redo, and Enter/Backspace-driven block splitting and merging) without requiring mouse interaction.

#### Scenario: Bold via keyboard shortcut
- **WHEN** the user selects text and presses the platform bold shortcut (e.g. Ctrl/Cmd+B)
- **THEN** the selection is marked bold, identical to using the toolbar

### Requirement: Focus mode
The editor SHALL offer a focus mode that hides surrounding chrome (navigation, sidebars, metadata panels) beyond the writing canvas itself.

#### Scenario: Enter focus mode
- **WHEN** the user enables focus mode
- **THEN** the writing canvas remains visible and interactive while surrounding admin chrome is hidden

#### Scenario: Exit focus mode
- **WHEN** the user disables focus mode
- **THEN** the previously hidden admin chrome reappears without any loss of editor content
