## MODIFIED Requirements

### Requirement: Article preview
Staff holding `news.manage` SHALL be able to preview a draft or scheduled article without changing its status. The preview SHALL render the article as it will appear when published, except that it SHALL additionally render the article's internal notes, marked as internal, so an editor sees them in the position they annotate. The preview SHALL be rendered from the article's stored structured content at request time, through the same allowlist renderer the public rendering uses, rather than from the stored public HTML.

#### Scenario: Preview a draft
- **WHEN** a staff member requests a preview of a draft article
- **THEN** the system returns a rendered representation of the current content and the article's status remains `draft`

#### Scenario: Preview shows internal notes
- **WHEN** a staff member previews an article containing an internal note
- **THEN** the note appears in the preview, marked as internal, in the position it occupies in the document

#### Scenario: Preview otherwise matches the public rendering
- **WHEN** a staff member previews an article containing no internal notes
- **THEN** the preview's body is the same rendering the public page would serve for that article

#### Scenario: Preview is reachable only by staff
- **WHEN** a client without `news.manage` requests the preview endpoint
- **THEN** the request is rejected, and no internal note reaches the caller

### Requirement: Only sanitized HTML is served publicly
The public read path SHALL return only the stored `body_html` and SHALL never expose the editor's `body_json`. Mappers and response contracts SHALL omit `body_json` from every public response. Because an internal note's text is carried only in `body_json` and never in `body_html`, this exclusion is the control that keeps notes confidential, not merely a matter of response hygiene.

#### Scenario: Public response omits body_json
- **WHEN** a client requests a published article via a public endpoint
- **THEN** the response includes `body_html` and any other public fields, but no `body_json` field

#### Scenario: A note is absent from every public field
- **WHEN** a published article containing an internal note is requested through any public endpoint
- **THEN** no field of the response contains the note's text, including the body, the excerpt, and any derived summary

### Requirement: Server-side content sanitization
On every save (autosave or explicit), the system SHALL generate sanitized, semantic HTML from the editor's structured content using an allowlist, and SHALL never store or serve unsanitized HTML derived from user input. The stored `body_html` SHALL contain only node types the renderer is explicitly taught to emit; a node type the renderer does not emit SHALL be absent from it entirely rather than emitted in a hidden or commented-out form.

#### Scenario: Disallowed markup is stripped
- **WHEN** an article's structured content contains a node or attribute outside the allowlist
- **THEN** the generated HTML omits that node or attribute rather than passing it through unchanged

#### Scenario: Sanitization happens on write, not on read
- **WHEN** an article is saved
- **THEN** its sanitized HTML is generated and stored at save time, and simply read back (not regenerated) on subsequent requests

#### Scenario: Every public read returns the stored HTML unchanged
- **WHEN** an article has been saved
- **THEN** every public read returns the stored `body_html` without re-running the renderer

#### Scenario: The staff preview is the one read that re-renders
- **WHEN** a staff member requests an article preview
- **THEN** the body is rendered from the stored structured content at request time, and this is the only read path permitted to do so

#### Scenario: An internal note never reaches the stored public HTML
- **WHEN** an article containing an internal note is saved
- **THEN** the stored `body_html` contains no part of that note — not as markup, not as a hidden element, and not as an HTML comment
