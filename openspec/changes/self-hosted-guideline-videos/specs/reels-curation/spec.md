## REMOVED Requirements

### Requirement: Permission-gated reels endpoints

**Reason**: The reels capability is removed in full. Self-hosted video is now carried by
`guide-of-the-week-management`, whose own permission-gated endpoints already exist and are
extended by this change rather than duplicated. See `proposal.md` ("What Changes").

### Requirement: A reel references a third-party video and does not store one

**Reason**: The rejection of self-hosted video that this requirement encoded is precisely what this
change reverses. `guide-of-the-week-management` now requires a self-hosted video per pick.

### Requirement: Provider allowlist

**Reason**: There is no longer a third-party provider to allowlist; video is self-hosted.

### Requirement: Only a provider identity is persisted

**Reason**: There is no provider identity to persist. A guide pick's video is a media record like
any other, addressed the same way the existing required photo already is.

### Requirement: Embed references are composed server-side from the stored identity

**Reason**: There is no embed to compose. Self-hosted video is served and played directly, with no
third-party frame, script, or template.

### Requirement: Every reel has a locally stored poster image

**Reason**: Superseded by `guide-of-the-week-management`'s existing required photo, which this
change repurposes as the poster for the pick's video.

### Requirement: Reel status governs public visibility

**Reason**: Superseded by the guide pick's existing `isActive` flag, which already governs public
visibility for the capability this content now lives in.

### Requirement: A single ordered reels rail

**Reason**: Superseded by the guide-pick list's existing single ordering, which already has no
maximum and is unaffected by this change.

### Requirement: The ordering is replaced as a whole list

**Reason**: Superseded by the guide-pick reorder endpoint, which already replaces its ordering as a
whole list.

### Requirement: Ordering validation

**Reason**: Superseded by the guide-pick reorder endpoint's own validation, which already requires
every existing id with no omission, duplicate, or unknown id, and imposes no maximum.

### Requirement: Reels that are not publicly visible may be ordered

**Reason**: Superseded by the guide-pick ordering's existing behavior, which already permits an
inactive pick to hold a position that becomes visible again on reactivation.

### Requirement: Admin reads report each entry's visibility

**Reason**: Superseded by the guide-pick admin list, which already reports both active and inactive
picks.

### Requirement: Public reels endpoint serves structured data

**Reason**: Superseded by the guide-pick public endpoint, extended by this change to also carry a
video URL.

### Requirement: The rail is not backfilled

**Reason**: Superseded by the guide-pick public endpoint's existing behavior, which already returns
only the stored order with no backfill.

### Requirement: Third-party embeds load only on user activation for poster-bearing reels

**Reason**: There is no third-party embed to defer. The equivalent behavior for self-hosted video —
poster on initial render, playback only on activation — is specified directly on
`guide-of-the-week-management`'s consuming page; see `web-public-site`'s "Guideline videos render
poster-first with playback on activation" in this same change.

### Requirement: A posterless reel's tile is a live, non-interactive embed

**Reason**: Does not apply to self-hosted video: `guide-of-the-week-management` keeps the poster
photo mandatory, so no posterless case exists to specify.

### Requirement: The reel lifecycle self-heals the ordering

**Reason**: Superseded by the guide-pick ordering's existing self-healing behavior on deactivation
and deletion, which this change does not alter.

### Requirement: Reels writes revalidate the homepage

**Reason**: Superseded by `guide-of-the-week-management`'s existing revalidation requirement, which
already covers every guide-pick write and status change.
