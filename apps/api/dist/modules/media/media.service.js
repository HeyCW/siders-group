import { AppError } from '../../middleware/errorHandler.js';
import { deleteStoredFile, storeUpload } from '../../lib/mediaStorage.js';
export function createMediaService(env, repository) {
    return {
        async upload(input) {
            const stored = await storeUpload(env, {
                tempPath: input.tempPath,
                sizeBytes: input.sizeBytes,
                declaredMime: input.declaredMime,
            });
            try {
                return await repository.create({
                    storagePath: stored.storagePath,
                    mime: stored.mime,
                    sizeBytes: stored.sizeBytes,
                    originalFilename: input.originalFilename,
                    alt: input.alt ?? null,
                    caption: input.caption ?? null,
                    uploadedBy: input.uploadedBy,
                });
            }
            catch (err) {
                // The file already landed on disk by this point; a failed insert must not leave it
                // behind with nothing referencing it (specs/media-management/spec.md - "Rejected
                // uploads leave no residue" extended to a post-write database failure).
                await deleteStoredFile(env, stored.storagePath).catch(() => { });
                throw err;
            }
        },
        async get(id) {
            const row = await repository.findById(id);
            if (!row)
                throw new AppError('Media not found', 404, 'not_found');
            return row;
        },
        async update(id, input) {
            const existing = await repository.findById(id);
            if (!existing)
                throw new AppError('Media not found', 404, 'not_found');
            return repository.update(id, input);
        },
        async delete(id) {
            const existing = await repository.findById(id);
            if (!existing)
                throw new AppError('Media not found', 404, 'not_found');
            // Row first, then file: if the delete is interrupted after the row is gone but before the
            // file is removed, the result is an orphaned file with nothing referencing it — not a
            // dangling reference an article or another reader could still resolve.
            await repository.delete(id);
            await deleteStoredFile(env, existing.storagePath);
        },
    };
}
