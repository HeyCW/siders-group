## MODIFIED Requirements

### Requirement: Accepted media types
The system SHALL accept only the image types `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
and `image/avif`, and the video type `video/mp4`. Any other type SHALL be rejected. No other video
type SHALL be accepted — in particular `video/webm` and `video/quicktime` SHALL be rejected, so that
every stored video is playable by every supported browser and phone-produced `.mov` files are turned
away at the boundary rather than stored unplayable.

#### Scenario: Accepted image type
- **WHEN** a staff member uploads a file whose real content is one of the accepted image types
- **THEN** the upload succeeds

#### Scenario: Accepted video type
- **WHEN** a staff member uploads a file whose real content is `video/mp4`
- **THEN** the upload succeeds and the media record's type records it as a video

#### Scenario: Other video containers rejected
- **WHEN** a staff member uploads a file whose real content is a video container other than MP4,
  such as WebM or QuickTime
- **THEN** the system rejects the upload, writes no file, and creates no media record

#### Scenario: Disallowed type rejected
- **WHEN** a staff member uploads a file whose real content is neither an accepted image type nor
  `video/mp4`, such as a PDF, an SVG, an archive, or an executable
- **THEN** the system rejects the upload, writes no file, and creates no media record

### Requirement: Maximum file size
The system SHALL enforce a maximum upload size that depends on the kind of file uploaded. The image
maximum SHALL default to 10 MiB and the video maximum SHALL default to 200 MiB. Both SHALL be
enforced server-side and SHALL NOT rely on any client-side check. A single shared maximum SHALL NOT
be used: the video maximum SHALL NOT authorize an image of that size.

Because a file's kind is known only after its content has been inspected, the system SHALL apply the
larger of the configured maxima as an outer bound while receiving the request, and SHALL then apply
the maximum for the inspected kind. A file that passes the outer bound but exceeds its own kind's
maximum SHALL be rejected.

#### Scenario: Oversized image rejected
- **WHEN** a staff member uploads an image larger than the configured image maximum
- **THEN** the system rejects the upload with a size error, writes no file, and creates no media
  record

#### Scenario: Oversized video rejected
- **WHEN** a staff member uploads a video larger than the configured video maximum
- **THEN** the system rejects the upload with a size error, writes no file, and creates no media
  record

#### Scenario: An image is not granted the video allowance
- **WHEN** a staff member uploads an image that is larger than the image maximum but smaller than
  the video maximum
- **THEN** the system rejects the upload, because the applicable maximum is the one for the
  inspected kind rather than the largest configured maximum

#### Scenario: File at its kind's limit is accepted
- **WHEN** a staff member uploads a file of an accepted type that is at or below the maximum for its
  own kind
- **THEN** the upload succeeds

### Requirement: Real content type is determined by inspecting file content
The system SHALL determine a file's type by inspecting the file's own leading bytes. The
client-declared `Content-Type` SHALL be treated as an unverified hint and SHALL NOT be the sole
basis for accepting a file. When the inspected type is not in the accepted list, or contradicts the
declared type, the upload SHALL be rejected.

Where two accepted types share a container format, the system SHALL distinguish them by the
container's declared brand rather than by the container alone, and SHALL reject a file whose brand
identifies neither. An MP4 video and an AVIF image both use the ISO base media container, so
recognising the container is not sufficient to identify either.

#### Scenario: Declared type is a lie
- **WHEN** a staff member uploads a file declared as `image/png` whose actual leading bytes identify
  it as a different, non-image format
- **THEN** the system rejects the upload, writes no file, and creates no media record

#### Scenario: Declared type disagrees with real type
- **WHEN** an uploaded file's inspected type is an accepted type but differs from the declared
  `Content-Type`
- **THEN** the system rejects the upload rather than silently storing it under either type

#### Scenario: A shared container is resolved by brand
- **WHEN** a staff member uploads a file using the ISO base media container
- **THEN** the system identifies it as `video/mp4` or `image/avif` according to its declared brand,
  and rejects it when the brand identifies neither

#### Scenario: Stored type comes from inspection
- **WHEN** an upload is accepted
- **THEN** the `mime` recorded on the media record is the type determined by inspecting the file
  content

### Requirement: Rejected uploads leave no residue
When an upload is rejected for any reason — permission, type, size, or content inspection — the
system SHALL NOT leave a stored file behind and SHALL NOT create a media record. This SHALL hold
even when the rejection is decided after part or all of the uploaded bytes have already been written
to intermediate storage: any such intermediate file SHALL be removed before the request completes.

#### Scenario: No orphaned file after rejection
- **WHEN** an upload is rejected after the request body has been received
- **THEN** no file remains under the storage root for that request and no media record exists for it

#### Scenario: Intermediate storage is cleaned up on rejection
- **WHEN** an upload's bytes have been written to intermediate storage and validation then rejects
  the upload
- **THEN** the intermediate file is removed, so a rejected upload consumes no lasting disk space

#### Scenario: Intermediate storage is cleaned up on a failed write
- **WHEN** an upload passes validation but the move into its final location fails
- **THEN** no intermediate file is left behind and no media record is created

## ADDED Requirements

### Requirement: An upload is not held entirely in memory
The system SHALL NOT require an uploaded file to be held in memory in its entirety in order to
validate or store it. The memory used to service an upload SHALL NOT grow in proportion to the size
of the file uploaded. This bounds concurrent uploads at the video maximum from exhausting the host's
memory.

#### Scenario: A large upload does not consume memory proportional to its size
- **WHEN** a staff member uploads a video at the configured video maximum
- **THEN** the request is serviced without holding the whole file in memory at once

#### Scenario: Concurrent large uploads do not exhaust memory
- **WHEN** several staff members upload videos at the configured video maximum at the same time
- **THEN** each request either completes or fails for its own reasons, and the host's memory use
  does not scale with the combined size of the uploads

### Requirement: Stored video supports seeking
The system SHALL serve a stored video in a way that allows a client to request a byte range of it
and to seek within it without downloading the whole file. A request for a range SHALL be answered
with that range rather than with the entire file.

#### Scenario: A range request is answered with a range
- **WHEN** a client requests a byte range of a stored video
- **THEN** the response carries only that range, and indicates that it is a partial response

#### Scenario: Seeking does not require a full download
- **WHEN** a visitor seeks to a position partway through a guideline video
- **THEN** playback resumes from that position without the whole file having been transferred

### Requirement: Playability is not guaranteed by acceptance
Accepting a video SHALL NOT be taken as a guarantee that every browser can play it. The system
inspects a file's container to identify it and SHALL NOT be required to inspect, validate, or
transcode the codecs carried inside that container.

#### Scenario: An accepted video may still be unplayable
- **WHEN** a staff member uploads a valid MP4 whose internal codecs are not widely supported
- **THEN** the upload is accepted, and the responsibility for the video playing in a visitor's
  browser rests on the uploaded file rather than on any check the system performs

#### Scenario: No transcoding is performed
- **WHEN** a video is stored and later served
- **THEN** the bytes served are the bytes uploaded, and the system produces no alternate rendition
