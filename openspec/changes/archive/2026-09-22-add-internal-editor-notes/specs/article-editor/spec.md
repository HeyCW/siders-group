## ADDED Requirements

### Requirement: Internal note block
The editor SHALL support an internal note block: body content an editor writes for other staff,
which SHALL be visible in the writing canvas and in the staff preview, and SHALL NOT be rendered
to a reader by any public surface. A note SHALL be a block-level node, never a mark applied to
part of a line. The editor SHALL present a note as visually distinct from body content, so an
author can tell at a glance which parts of the draft a reader will not see.

#### Scenario: Insert an internal note
- **WHEN** an editor inserts an internal note block and types into it
- **THEN** the note is part of the article's stored content and renders in the canvas, marked as
  internal

#### Scenario: A note is visually distinct in the canvas
- **WHEN** a draft contains an internal note among ordinary paragraphs
- **THEN** the note is presented differently from the surrounding body content, rather than
  looking like text a reader would see

#### Scenario: A note holds ordinary text
- **WHEN** an editor types several sentences into an internal note
- **THEN** the text is persisted with the article and reads back unchanged on the next edit

#### Scenario: Deleting a note leaves the body intact
- **WHEN** an editor deletes an internal note that sits between two paragraphs
- **THEN** both paragraphs remain exactly as they were, and no blank block is left behind

#### Scenario: A note is not a mark
- **WHEN** the editor's content model is inspected
- **THEN** an internal note is a block-level node, and there is no way to mark part of a sentence
  as internal while leaving the rest of that sentence public

## MODIFIED Requirements

### Requirement: Slash command menu for block insertion
Typing `/` at the start of an empty line SHALL open a searchable menu of insertable block types (heading, quote, code block, ordered list, unordered list, checklist, table, image, divider, video embed, internal note). Selecting an entry SHALL replace the `/` trigger with the chosen block.

#### Scenario: Insert a heading via slash command
- **WHEN** the user types `/` on an empty line, types "heading", and selects "Heading 2"
- **THEN** the current line becomes an H2 block and the `/` query text is removed

#### Scenario: Dismiss slash menu
- **WHEN** the slash menu is open and the user presses Escape
- **THEN** the menu closes and the `/` character remains as plain text

#### Scenario: Insert an internal note via slash command
- **WHEN** the user types `/` on an empty line, types "note", and selects "Internal note"
- **THEN** the current line becomes an internal note block and the `/` query text is removed

### Requirement: Supported content blocks
The editor SHALL support creating and editing: paragraphs; headings H1-H3; bold, italic, underline, and strikethrough marks; links; block quotes; code blocks; ordered and unordered lists; checklists; tables; images; horizontal dividers; internal notes; and optionally embedded videos by URL. The image node's underlying content model MAY carry width, alignment, and caption attributes for future use, but this requirement does not itself mandate any UI for setting them.

#### Scenario: Build a checklist
- **WHEN** the user inserts a checklist block and adds items, checking one of them
- **THEN** that item is persisted with a checked state distinct from unchecked items

#### Scenario: Every block type but the internal note reaches the reader
- **WHEN** an article containing one of each supported block is published
- **THEN** the public page renders every block except the internal note, which is absent
