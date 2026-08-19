## MODIFIED Requirements

### Requirement: Every reel has a locally stored poster image
A reel MAY reference a poster image stored by this system as a media record. A reel MAY be created
and left with no poster. When a poster is supplied, it SHALL be an ordinary image subject to the
existing media rules.

#### Scenario: A reel can be created with no poster image
- **WHEN** a staff member creates a reel and supplies no poster image
- **THEN** the system accepts the request and creates the reel with no poster

#### Scenario: A reel can be created with a poster image
- **WHEN** a staff member creates a reel and supplies a poster image
- **THEN** the system persists the reel with that poster

#### Scenario: Poster is a normal media record
- **WHEN** a poster image is uploaded
- **THEN** it is accepted, validated, stored, and its URL derived by the existing media rules, with no reels-specific storage path

#### Scenario: Poster survives provider failure
- **WHEN** a reel's provider is unreachable or its source video no longer exists, and the reel has a poster
- **THEN** the reel's poster image is still served, because it is stored by this system rather than by the provider

### Requirement: Public reels endpoint serves structured data
The system SHALL expose a public endpoint returning the publicly visible reels in their stored
order. Each item SHALL carry its provider, its video identifier, its caption, and its poster URL
when one is stored, as structured fields. The endpoint SHALL require no authentication.

#### Scenario: Rail is served in stored order
- **WHEN** a client requests the public reels endpoint and publicly visible ordered reels exist
- **THEN** they are returned in their stored order

#### Scenario: Structured fields rather than markup
- **WHEN** a client reads the public reels endpoint
- **THEN** each item carries provider, identifier, caption, and its poster URL when one is stored, and carries no HTML or embed markup

#### Scenario: A reel with no poster is served without one
- **WHEN** the public reels endpoint includes a reel that has no stored poster
- **THEN** that reel's entry in the response carries no poster URL, rather than an empty string or placeholder value

#### Scenario: Anonymous and staff callers receive identical output
- **WHEN** a staff member holding `news.manage` requests the public reels endpoint
- **THEN** the response is identical to what an anonymous caller receives, containing no draft or unavailable reel

#### Scenario: Invisible reels are omitted server-side
- **WHEN** the ordering contains reels that are not publicly visible
- **THEN** the API omits them before responding, and no consumer is required to filter them out

### Requirement: Third-party embeds load only on user activation
Public rendering of a reel SHALL present a facade tile on initial render — the locally stored
poster image when the reel has one, otherwise a plain fallback tile — and SHALL NOT create a
third-party frame, script, or network request for the provider until the visitor activates that
reel. A reel with no poster SHALL be exactly as activatable as one with a poster: the fallback tile
carries the same click-to-activate behavior. Activating one reel SHALL NOT load the embed for any
other reel.

This requirement constrains the follow-up change that renders the rail on `/` — see `proposal.md`
("Rendering the rail" - Non-Goals) and `design.md` ("Facade rendering: poster first, frame only on
user activation"). `add-reels-curation` itself ships no consumer of `buildReelEmbedUrl` outside its
own unit test; the rule is recorded here so that follow-up inherits it rather than reaching for a
provider's copy-paste embed snippet.

#### Scenario: Initial render contacts no provider
- **WHEN** a visitor loads a page carrying the reels rail and does not interact with it
- **THEN** no frame, script, or request to any provider is created for any reel

#### Scenario: Activation loads one embed
- **WHEN** a visitor activates a single reel
- **THEN** the embed is created for that reel only, and the other reels remain facade tiles

#### Scenario: Poster carries the tile before activation, when one exists
- **WHEN** the reels rail renders a reel that has a poster
- **THEN** that reel is represented by its locally stored poster image

#### Scenario: A reel with no poster is still fully playable
- **WHEN** the reels rail renders a reel that has no poster
- **THEN** that reel is represented by a plain fallback tile rather than a broken or missing image, and activating it loads that reel's embed exactly as a poster-bearing reel's tile would
