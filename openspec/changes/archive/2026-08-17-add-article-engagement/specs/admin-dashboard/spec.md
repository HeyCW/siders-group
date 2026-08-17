## ADDED Requirements

### Requirement: Article readership
The dashboard SHALL report reads and unique reads across all articles over the trailing 7 days,
and SHALL list the most-read articles over the trailing 30 days with each one's read count. Both
windows SHALL be computed from the same instant the dashboard's other sections use, in the same
timezone.

#### Scenario: Trailing readership totals are reported
- **WHEN** the dashboard is requested
- **THEN** it reports total reads and unique reads across all articles for the trailing 7 days

#### Scenario: The most-read articles are listed with their counts
- **WHEN** the dashboard is requested
- **THEN** it lists the most-read articles of the trailing 30 days, each with its title, its public path, and its read count, ordered most-read first

#### Scenario: The listing is bounded
- **WHEN** more articles have reads in the window than the listing's limit
- **THEN** only that many are returned, rather than an unbounded list

#### Scenario: No readership yet reports zero, not an error
- **WHEN** no views have been recorded in either window
- **THEN** the totals are reported as zero and the most-read listing is empty

#### Scenario: Readership shares the dashboard's instant and timezone
- **WHEN** the readership windows are computed
- **THEN** they derive from the same instant as the dashboard's other sections, in the same timezone those sections use
