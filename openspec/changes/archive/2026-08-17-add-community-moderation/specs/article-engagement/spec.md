## MODIFIED Requirements

### Requirement: Likes require a reader session and toggle
Liking SHALL be available only to an authenticated reader, and SHALL toggle: a reader who has not liked an article likes it, and a reader who has liked it removes that like. A reader SHALL hold at most one like per article. Anonymous callers SHALL be rejected.

#### Scenario: An anonymous caller cannot like
- **WHEN** a caller holding no reader session attempts to like an article
- **THEN** the request is rejected and no like is recorded

#### Scenario: A first like is recorded
- **WHEN** a signed-in reader who has not liked an article likes it
- **THEN** a like is recorded for that reader and article, and the article's like count increases by one

#### Scenario: Liking again removes the like
- **WHEN** a signed-in reader who has already liked an article invokes like again
- **THEN** their like is removed and the article's like count decreases by one

#### Scenario: A reader cannot like the same article twice
- **WHEN** a reader's like requests for one article race each other
- **THEN** at most one like exists for that reader and article

### Requirement: A sanctioned reader may still like
Muting or banning SHALL restrict a reader from authoring content and SHALL NOT restrict liking, since a like publishes no reader-authored text.

#### Scenario: A muted reader likes an article
- **WHEN** a reader whose mute period has not elapsed likes an article
- **THEN** the like is recorded

#### Scenario: A muted reader cannot comment
- **WHEN** a reader whose mute period has not elapsed submits a comment
- **THEN** the request is rejected and no comment is recorded

#### Scenario: A banned reader likes an article
- **WHEN** a reader who is banned likes an article
- **THEN** the like is recorded

#### Scenario: A banned reader cannot comment
- **WHEN** a reader who is banned submits a comment
- **THEN** the request is rejected and no comment is recorded

### Requirement: Comments require a reader session and publish immediately
Submitting a comment SHALL be available only to an authenticated reader who is neither banned nor currently muted. An accepted comment SHALL become publicly visible immediately, with no review step. A comment body SHALL be required, non-blank, and bounded in length.

#### Scenario: An anonymous caller cannot comment
- **WHEN** a caller holding no reader session submits a comment
- **THEN** the request is rejected and no comment is recorded

#### Scenario: An accepted comment is immediately readable
- **WHEN** a signed-in reader submits a valid comment
- **THEN** that comment appears in the article's public comment listing without any intervening approval

#### Scenario: A blank comment is rejected
- **WHEN** a reader submits a comment whose body is empty or only whitespace
- **THEN** the request is rejected as invalid and no comment is recorded

#### Scenario: An over-long comment is rejected
- **WHEN** a reader submits a comment body longer than the permitted maximum
- **THEN** the request is rejected as invalid and no comment is recorded

## RENAMED Requirements
- FROM: `### Requirement: A muted reader may still like`
- TO: `### Requirement: A sanctioned reader may still like`
