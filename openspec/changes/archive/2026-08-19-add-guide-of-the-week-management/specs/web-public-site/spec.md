## ADDED Requirements

### Requirement: The guide-of-the-week section renders real, admin-managed picks
The home page's "Siders Guide of the Week" section SHALL render the active guide picks returned by
the guide-of-the-week-management capability's public listing, in the order that listing returns,
and SHALL NOT render any hardcoded or placeholder guide-pick content.

#### Scenario: Guide picks come from the backend
- **WHEN** the home page renders its guide-of-the-week section
- **THEN** every pick shown corresponds to an active guide-pick record, and no placeholder city,
  place, description, or photo-drop-target appears

#### Scenario: No guide picks means no section
- **WHEN** the guide-of-the-week-management capability's public listing returns no active guide
  picks, whether because none are configured or because the request fails
- **THEN** the home page renders no guide-of-the-week heading, edition trailer, or grid for that
  section

### Requirement: The guide-of-the-week section layout accommodates any number of picks
The guide-of-the-week section SHALL render correctly for any number of active guide picks,
including one, exactly two, more than fit in a single row, and zero. No divider, padding, or
border rule in the layout SHALL depend on a pick's position being the first of exactly two.

#### Scenario: A single pick renders without a dangling divider
- **WHEN** exactly one active guide pick exists
- **THEN** it renders as a complete, self-contained card with no divider implying a missing second
  item

#### Scenario: More picks than fit one row wrap without a missing divider
- **WHEN** enough active guide picks exist that they wrap onto more than one row
- **THEN** every pick, including ones in the second row, renders with the same border and padding
  treatment as picks in the first row
