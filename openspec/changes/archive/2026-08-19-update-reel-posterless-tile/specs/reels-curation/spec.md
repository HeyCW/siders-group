## MODIFIED Requirements

### Requirement: Third-party embeds load only on user activation for poster-bearing reels
Public rendering of a reel that has a stored poster SHALL present that poster image on initial
render and SHALL NOT create a third-party frame, script, or network request for the provider
until the visitor activates that reel. Activating one reel SHALL NOT load the embed for any
other reel. A reel with no poster is excluded from this requirement — see "A posterless reel's
tile is a live, non-interactive embed" — and instead renders a live provider embed as its tile
from initial render.

This requirement constrains the follow-up change that renders the rail on `/` — see `proposal.md`
("Rendering the rail" - Non-Goals) and `design.md` ("Facade rendering: poster first, frame only
on user activation"). `add-reels-curation` itself ships no consumer of `buildReelEmbedUrl` outside
its own unit test; the rule is recorded here so that follow-up inherits it rather than reaching
for a provider's copy-paste embed snippet.

#### Scenario: Initial render contacts no provider for a poster-bearing reel
- **WHEN** a visitor loads a page carrying the reels rail, at least one rail reel has a poster,
  and the visitor does not interact with it
- **THEN** no frame, script, or request to any provider is created for that reel

#### Scenario: Activation loads one embed
- **WHEN** a visitor activates a single poster-bearing reel
- **THEN** the embed is created for that reel only, and the other poster-bearing reels remain
  posters

#### Scenario: Poster carries a poster-bearing reel's tile before activation
- **WHEN** the reels rail renders and a reel has a poster
- **THEN** that reel is represented by its locally stored poster image, and no third-party frame
  is created for it until it is activated

## ADDED Requirements

### Requirement: A posterless reel's tile is a live, non-interactive embed
A reel with no poster SHALL render its provider embed directly in its rail tile from initial
render, in place of the poster image. This embed SHALL NOT be autoplaying and SHALL NOT be
directly interactive — pointer interaction with the tile SHALL activate the same lightbox
playback every other reel uses, rather than any control native to the embed itself.

#### Scenario: Posterless reel shows its own embed on initial render
- **WHEN** the reels rail renders and a reel has no poster
- **THEN** that reel's tile displays a live embed of its provider video rather than a flat
  fallback tile, without requiring any visitor interaction

#### Scenario: The embed does not autoplay
- **WHEN** a posterless reel's tile embed loads
- **THEN** it does not begin video playback on its own

#### Scenario: Clicking a posterless reel's tile opens the same lightbox as any other reel
- **WHEN** a visitor clicks a posterless reel's tile
- **THEN** the same lightbox player used for poster-bearing reels opens and plays that reel,
  and no playback begins inside the tile's own embed

#### Scenario: A poster-bearing reel is unaffected
- **WHEN** the reels rail renders and a reel has a poster
- **THEN** that reel's tile shows its poster image exactly as before, with no embed loaded until
  activation
