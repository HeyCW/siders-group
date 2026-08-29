import { publicUrlFor } from '../../lib/mediaStorage.js';
/** `url` is derived from `storage_path` here, at map time — never stored on the row. */
export function toMediaResponse(env, row) {
    return {
        id: row.id,
        url: publicUrlFor(env, row.storagePath),
        mime: row.mime,
        sizeBytes: row.sizeBytes,
        originalFilename: row.originalFilename,
        alt: row.alt,
        caption: row.caption,
        createdAt: row.createdAt.toISOString(),
    };
}
