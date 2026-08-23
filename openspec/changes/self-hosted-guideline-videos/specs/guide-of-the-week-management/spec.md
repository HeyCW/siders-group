## MODIFIED Requirements

### Requirement: Guide-pick CRUD
The system SHALL expose admin endpoints to create, list, update, and delete guide picks. Each
guide pick SHALL have a city, a place name, a description, a video, a poster photo, and an active
flag defaulting to active.

#### Scenario: Create a guide pick
- **WHEN** a staff member holding `news.manage` submits a valid city, place, description, video, and
  poster photo
- **THEN** the system persists the guide pick and returns its representation including its id

#### Scenario: Admin list includes inactive guide picks
- **WHEN** a staff member holding `news.manage` lists guide picks
- **THEN** the response includes both active and inactive guide picks

#### Scenario: Admin list reports both media references
- **WHEN** a staff member holding `news.manage` lists guide picks
- **THEN** each entry reports both its video and its poster photo, so a pick missing neither can be
  distinguished from one that is complete

### Requirement: A guide pick requires a photo
A guide pick SHALL reference a photo image stored by this system as a media record. A guide pick
SHALL NOT be created or left without one. The photo SHALL be an ordinary image subject to the
existing media rules.

The photo SHALL serve as the poster for the guide pick's video: it is what a visitor sees before
playback begins, and it is what remains presentable if the video itself cannot be played. It is
therefore required whether or not a poster could be derived from the video by other means — the
system SHALL NOT extract a poster frame from the video in place of this photo.

#### Scenario: Photo is required at creation
- **WHEN** a staff member attempts to create a guide pick without a photo
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: Photo reference must be an existing media record
- **WHEN** a staff member submits a guide pick referencing a photo identifier that does not match
  any media record
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: Photo is a normal media record
- **WHEN** a photo image is uploaded for a guide pick
- **THEN** it is accepted, validated, stored, and its URL derived by the existing media rules,
  with no guide-pick-specific storage path

#### Scenario: Photo must be an image, not a video
- **WHEN** a staff member submits a video media record as a guide pick's photo
- **THEN** the system rejects the request and creates no guide pick

### Requirement: Public read serves only active guide picks in order
The system SHALL expose a public endpoint that returns active guide picks in their stored order,
each with its city, place, description, poster photo URL, and video URL. The endpoint SHALL require
no authentication and SHALL NOT include inactive guide picks or any admin-only field.

The endpoint SHALL return a single flat ordered collection. It SHALL NOT group entries by city:
the city travels with each entry, and grouping is a presentation concern of the consuming page, so
that the stored order remains the single source of truth for ordering.

#### Scenario: Public listing excludes inactive picks
- **WHEN** a client requests the public guide-pick listing
- **THEN** the response contains only active guide picks, in their stored order

#### Scenario: Public shape omits admin-only fields
- **WHEN** a client reads the public guide-pick listing
- **THEN** each entry contains city, place, description, poster photo URL, and video URL only — no
  active flag, no sort-order value, no internal id

#### Scenario: Entries are flat, not grouped
- **WHEN** a client reads the public guide-pick listing and the active picks span several cities
- **THEN** the response is one ordered collection carrying each entry's city, rather than a
  structure keyed or nested by city

## ADDED Requirements

### Requirement: A guide pick requires a self-hosted video
A guide pick SHALL reference a video stored by this system as a media record. A guide pick SHALL NOT
be created or left without one. The video SHALL be subject to the existing media rules, including
the accepted video type and the video size maximum.

The video SHALL be served from this system's own storage. A guide pick SHALL NOT reference a video
hosted by a third party, and the system SHALL NOT compose, store, or serve an embed reference,
frame, or script belonging to any third-party video provider for a guide pick.

#### Scenario: Video is required at creation
- **WHEN** a staff member attempts to create a guide pick without a video
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: Video reference must be an existing media record
- **WHEN** a staff member submits a guide pick referencing a video identifier that does not match any
  media record
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: Video must be a video, not an image
- **WHEN** a staff member submits an image media record as a guide pick's video
- **THEN** the system rejects the request and creates no guide pick

#### Scenario: A guide pick cannot be left without its video
- **WHEN** a staff member updates a guide pick in an attempt to clear its video reference
- **THEN** the system rejects the request and the guide pick retains its video

#### Scenario: No third-party video reference is accepted
- **WHEN** a staff member submits a guide pick identifying a video by external URL or by provider
  and identifier rather than by a stored media record
- **THEN** the system rejects the request and creates no guide pick

### Requirement: A guide pick's video is not deleted out from under it
A media record referenced as a guide pick's video SHALL NOT be deletable while that reference stands.
A guide pick has no presentable state without its video, so losing one SHALL fail loudly rather than
leave a guide pick referencing a video that is no longer stored.

#### Scenario: Deleting a referenced video is refused
- **WHEN** a staff member attempts to delete a media record that a guide pick references as its video
- **THEN** the system refuses the deletion and both the media record and the guide pick remain intact

#### Scenario: Deleting an unreferenced video succeeds
- **WHEN** a staff member deletes a video media record that no guide pick references
- **THEN** the deletion succeeds

### Requirement: Guide picks predating the video requirement do not survive
No guide pick SHALL exist without a video once this capability is deployed. Because no video is
stored anywhere in the system before this change, a guide pick created earlier cannot be brought into
compliance automatically, and the system SHALL NOT invent, substitute, or derive a video for one.

Every guide pick existing at the time this requirement takes effect SHALL either have been given a
video deliberately beforehand or SHALL be removed. Deployment SHALL NOT leave a guide pick that
satisfies neither.

#### Scenario: No videoless guide pick remains after deployment
- **WHEN** the guide-pick list is inspected after this capability is deployed
- **THEN** every guide pick in it references a video, and no guide pick lacking one remains

#### Scenario: No video is fabricated for an existing pick
- **WHEN** a guide pick that predates this change is brought into compliance
- **THEN** it is either given a deliberately uploaded video or removed, and no placeholder, derived,
  or substitute video is created on its behalf
