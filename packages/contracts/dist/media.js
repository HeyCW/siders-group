import { z } from 'zod';
/**
 * The only types this system will ever store (design.md - "Media storage"). Shared by the
 * upload validator and the contract so the accepted set can't drift between the two. `video/mp4`
 * is the only accepted video type — MP4-only was a deliberate choice over also accepting WebM or
 * QuickTime (openspec/changes/self-hosted-guideline-videos/proposal.md).
 */
export const MEDIA_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const MEDIA_VIDEO_MIME_TYPES = ['video/mp4'];
export const MEDIA_MIME_TYPES = [...MEDIA_IMAGE_MIME_TYPES, ...MEDIA_VIDEO_MIME_TYPES];
export const mediaMimeTypeSchema = z.enum(MEDIA_MIME_TYPES);
export function isVideoMimeType(mime) {
    return MEDIA_VIDEO_MIME_TYPES.includes(mime);
}
/**
 * Upload itself travels as multipart form data, not JSON — this schema covers only the
 * optional metadata fields alongside the file (specs/media-management/spec.md -
 * "Alt text and caption").
 */
export const mediaUploadMetadataSchema = z
    .object({
    alt: z.string().max(500).optional(),
    caption: z.string().max(1000).optional(),
})
    .strict();
export const mediaUpdateRequestSchema = z
    .object({
    alt: z.string().max(500).nullable().optional(),
    caption: z.string().max(1000).nullable().optional(),
})
    .strict();
/**
 * `url` is always derived from `storage_path` at map time — never stored on the record
 * (specs/media-management/spec.md - "Public URL is derived from the media record"). The
 * response never exposes the storage-root-relative path itself, only the composed URL.
 */
export const mediaResponseSchema = z.object({
    id: z.string().uuid(),
    url: z.string(),
    mime: mediaMimeTypeSchema,
    sizeBytes: z.number().int().positive(),
    originalFilename: z.string(),
    alt: z.string().nullable(),
    caption: z.string().nullable(),
    createdAt: z.string().datetime(),
});
