## MODIFIED Requirements

### Requirement: Reader-only authorization
An endpoint declared reader-only SHALL be reachable only by callers holding an authenticated reader identity, and SHALL reject anonymous callers and staff callers who hold no reader identity. A reader who is banned, or whose mute period has not elapsed, SHALL be rejected only by endpoints that create reader-authored content, while retaining access to every other reader-only endpoint.

#### Scenario: Anonymous caller rejected from a reader-only endpoint
- **WHEN** an anonymous caller requests an endpoint declared reader-only, such as the endpoint returning the current reader's own account information
- **THEN** the request is rejected

#### Scenario: Signed-in reader allowed
- **WHEN** an authenticated reader requests a reader-only endpoint
- **THEN** the request is allowed

#### Scenario: Banned reader rejected at a content-creating endpoint but keeps read and like access
- **WHEN** a reader whose status is banned requests an endpoint that creates reader-authored content
- **THEN** the request is rejected, while their access to read-only endpoints and to liking is unaffected

#### Scenario: A banned reader's existing session keeps working
- **WHEN** a reader is banned while holding an existing session, and they then request a reader-only endpoint that does not create content
- **THEN** their existing session credentials are accepted exactly as before the ban

#### Scenario: Muted reader cannot author content
- **WHEN** a reader whose mute period has not elapsed requests an endpoint that creates reader-authored content
- **THEN** the request is rejected while their access to read-only endpoints is unaffected
