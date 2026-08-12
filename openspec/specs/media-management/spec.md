# media-management Specification

## Purpose

Defines media upload and storage for article imagery: the `media.manage` permission gate, the accepted file types and size limit, server-side content validation, how files are named and laid out on the application's local filesystem, the `app.media` record that is the canonical reference, how a public URL is derived from it, and how media is associated with an article.

## Requirements

### Requirement: Permission-gated media endpoints
Every admin endpoint that uploads, updates, or deletes media SHALL declare the `media.manage` permission. Authorization SHALL be evaluated against the caller's permissions and SHALL NOT branch on the name of any role.

#### Scenario: Staff member without media.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `media.manage` attempts to upload a file
- **THEN** the system rejects the request as forbidden, writes no file, and creates no media record

#### Scenario: Staff member with media.manage is allowed
- **WHEN** an authenticated staff member whose role includes `media.manage` uploads a valid file
- **THEN** the request is allowed

#### Scenario: Unauthenticated upload rejected
- **WHEN** an upload request is made without a valid staff session
- **THEN** the system rejects the request, writes no file, and creates no media record

### Requirement: Media is stored on the application's local filesystem
Uploaded files SHALL be written to a directory on the application's own filesystem, rooted at a configured storage path. The system SHALL NOT depend on an object-storage service or presigned upload URLs for this capability.

#### Scenario: Successful upload writes a file and a record
- **WHEN** a staff member holding `media.manage` uploads a valid image
- **THEN** the file is written beneath the configured storage root and a corresponding `app.media` record is created

#### Scenario: Storage root is required configuration
- **WHEN** the application starts without a configured media storage path
- **THEN** startup fails with a configuration error rather than accepting uploads with an undefined destination

### Requirement: Accepted media types
The system SHALL accept only the image types `image/jpeg`, `image/png`, `image/webp`, `image/gif`, and `image/avif`. Any other type SHALL be rejected.

#### Scenario: Accepted image type
- **WHEN** a staff member uploads a file whose real content is one of the accepted image types
- **THEN** the upload succeeds

#### Scenario: Disallowed type rejected
- **WHEN** a staff member uploads a file whose real content is not one of the accepted image types, such as a PDF, an SVG, an archive, or an executable
- **THEN** the system rejects the upload, writes no file, and creates no media record

### Requirement: Maximum file size
The system SHALL reject any upload exceeding the configured maximum file size, which SHALL default to 10 MiB. The limit SHALL be enforced server-side and SHALL NOT rely on any client-side check.

#### Scenario: Oversized upload rejected
- **WHEN** a staff member uploads a file larger than the configured maximum size
- **THEN** the system rejects the upload with a size error, writes no file, and creates no media record

#### Scenario: File at the limit is accepted
- **WHEN** a staff member uploads a file of an accepted type that is at or below the configured maximum size
- **THEN** the upload succeeds

### Requirement: Real content type is determined by inspecting file content
The system SHALL determine a file's type by inspecting the file's own leading bytes. The client-declared `Content-Type` SHALL be treated as an unverified hint and SHALL NOT be the sole basis for accepting a file. When the inspected type is not in the accepted list, or contradicts the declared type, the upload SHALL be rejected.

#### Scenario: Declared type is a lie
- **WHEN** a staff member uploads a file declared as `image/png` whose actual leading bytes identify it as a different, non-image format
- **THEN** the system rejects the upload, writes no file, and creates no media record

#### Scenario: Declared type disagrees with real type
- **WHEN** an uploaded file's inspected type is an accepted image type but differs from the declared `Content-Type`
- **THEN** the system rejects the upload rather than silently storing it under either type

#### Scenario: Stored type comes from inspection
- **WHEN** an upload is accepted
- **THEN** the `mime` recorded on the media record is the type determined by inspecting the file content

### Requirement: Server-generated file names and date-sharded paths
The system SHALL name every stored file from a server-generated identifier plus an extension derived from the inspected content type, and SHALL place it under a path sharded by upload date. The client-supplied filename SHALL NOT be used to construct any filesystem path.

#### Scenario: Stored name is server-generated
- **WHEN** a staff member uploads a file
- **THEN** the stored filename is a server-generated identifier with an extension matching the inspected content type, not the name the client supplied

#### Scenario: Original filename is retained as data only
- **WHEN** a staff member uploads a file
- **THEN** the client-supplied filename is recorded on the media record for display purposes and does not appear in the stored path

#### Scenario: Path traversal attempt is structurally impossible
- **WHEN** a staff member uploads a file whose declared filename contains path separators or parent-directory segments such as `../`
- **THEN** the stored file is still written under the configured storage root using the server-generated name, and no file is written outside that root

#### Scenario: Files are sharded by date
- **WHEN** files are uploaded across different months
- **THEN** each file is stored under a date-derived subdirectory of the storage root rather than all files sharing one flat directory

### Requirement: Media record is the canonical reference
Every accepted upload SHALL create an `app.media` record holding the storage-root-relative path, the inspected MIME type, the byte size, the original filename, optional alt text and caption, the uploading staff member, and a creation timestamp. The record SHALL store a relative path and SHALL NOT store an absolute public URL.

#### Scenario: Record created on upload
- **WHEN** an upload is accepted
- **THEN** a media record is created capturing the relative storage path, inspected MIME type, byte size, original filename, uploader, and creation time

#### Scenario: Alt text and caption
- **WHEN** a staff member sets alt text and a caption on a media item
- **THEN** those values are persisted on the media record and returned with it

#### Scenario: No absolute URL is stored
- **WHEN** a media record is inspected
- **THEN** it holds a path relative to the storage root, not a fully-qualified URL

### Requirement: Public URL is derived from the media record
The system SHALL derive a media item's public URL by combining the configured public base URL with the record's stored relative path, at the time the item is mapped for a response.

#### Scenario: URL derived at map time
- **WHEN** a media item is returned in any admin or public response
- **THEN** its URL is composed from the configured public base URL and the record's relative path

#### Scenario: Relocating media does not require a data migration
- **WHEN** the configured public base URL changes
- **THEN** every previously uploaded media item resolves to the new location without any change to stored records

### Requirement: Media association with articles
An article SHALL reference its featured image by media record identifier. Media used inside article body content SHALL be referenced by the stored content rather than duplicated onto the article row.

#### Scenario: Featured image assigned by reference
- **WHEN** a staff member sets an uploaded media item as an article's featured image
- **THEN** the article stores a reference to that media record, and the article's featured image URL is derived from it

#### Scenario: Same media used by several articles
- **WHEN** one media item is set as the featured image of more than one article
- **THEN** all of those articles reference the same media record and resolve to the same derived URL

#### Scenario: Deleting media clears article references
- **WHEN** a media record referenced as an article's featured image is deleted
- **THEN** the referencing article's featured image reference is cleared and the article remains intact and retrievable

### Requirement: Rejected uploads leave no residue
When an upload is rejected for any reason — permission, type, size, or content inspection — the system SHALL NOT leave a stored file behind and SHALL NOT create a media record.

#### Scenario: No orphaned file after rejection
- **WHEN** an upload is rejected after the request body has been received
- **THEN** no file remains under the storage root for that request and no media record exists for it
