import { z } from 'zod';

/**
 * The only types this system will ever store (design.md - "Media storage"). Shared by the
 * upload validator and the contract so the accepted set can't drift between the two.
 */
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;

export const mediaMimeTypeSchema = z.enum(MEDIA_MIME_TYPES);
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>;

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
export type MediaUploadMetadata = z.infer<typeof mediaUploadMetadataSchema>;

export const mediaUpdateRequestSchema = z
  .object({
    alt: z.string().max(500).nullable().optional(),
    caption: z.string().max(1000).nullable().optional(),
  })
  .strict();
export type MediaUpdateRequest = z.infer<typeof mediaUpdateRequestSchema>;

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
export type MediaResponse = z.infer<typeof mediaResponseSchema>;
