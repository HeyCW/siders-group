## ADDED Requirements

### Requirement: Contact page renders the office location as a map sourced from static site content
The Contact page's "Find us" section SHALL render a map of the office location, built from a hardcoded location string maintained alongside the page's other static contact details, rather than from any backend-provided data. The map SHALL replace the unfilled placeholder previously shown in this section.

#### Scenario: Map renders from static content
- **WHEN** the Contact page is rendered
- **THEN** the "Find us" section shows a map centered on the configured office location string, with no request to `apps/api` for map data

#### Scenario: Map section is usable on small viewports
- **WHEN** the Contact page is rendered on a mobile-width viewport
- **THEN** the map section uses an aspect ratio tall enough to be legible, rather than the wide aspect ratio used on desktop
