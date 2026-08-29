import { z } from 'zod';
/**
 * The only types this system will ever store (design.md - "Media storage"). Shared by the
 * upload validator and the contract so the accepted set can't drift between the two. `video/mp4`
 * is the only accepted video type — MP4-only was a deliberate choice over also accepting WebM or
 * QuickTime (openspec/changes/self-hosted-guideline-videos/proposal.md).
 */
export declare const MEDIA_IMAGE_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export declare const MEDIA_VIDEO_MIME_TYPES: readonly ["video/mp4"];
export declare const MEDIA_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4"];
export declare const mediaMimeTypeSchema: z.ZodEnum<["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4"]>;
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>;
export declare function isVideoMimeType(mime: string): mime is (typeof MEDIA_VIDEO_MIME_TYPES)[number];
/**
 * Upload itself travels as multipart form data, not JSON — this schema covers only the
 * optional metadata fields alongside the file (specs/media-management/spec.md -
 * "Alt text and caption").
 */
export declare const mediaUploadMetadataSchema: z.ZodObject<{
    alt: z.ZodOptional<z.ZodString>;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    alt?: string | undefined;
    caption?: string | undefined;
}, {
    alt?: string | undefined;
    caption?: string | undefined;
}>;
export type MediaUploadMetadata = z.infer<typeof mediaUploadMetadataSchema>;
export declare const mediaUpdateRequestSchema: z.ZodObject<{
    alt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    caption: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    alt?: string | null | undefined;
    caption?: string | null | undefined;
}, {
    alt?: string | null | undefined;
    caption?: string | null | undefined;
}>;
export type MediaUpdateRequest = z.infer<typeof mediaUpdateRequestSchema>;
/**
 * `url` is always derived from `storage_path` at map time — never stored on the record
 * (specs/media-management/spec.md - "Public URL is derived from the media record"). The
 * response never exposes the storage-root-relative path itself, only the composed URL.
 */
export declare const mediaResponseSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    mime: z.ZodEnum<["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4"]>;
    sizeBytes: z.ZodNumber;
    originalFilename: z.ZodString;
    alt: z.ZodNullable<z.ZodString>;
    caption: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    alt: string | null;
    caption: string | null;
    url: string;
    mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif" | "video/mp4";
    sizeBytes: number;
    originalFilename: string;
}, {
    id: string;
    createdAt: string;
    alt: string | null;
    caption: string | null;
    url: string;
    mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif" | "video/mp4";
    sizeBytes: number;
    originalFilename: string;
}>;
export type MediaResponse = z.infer<typeof mediaResponseSchema>;
