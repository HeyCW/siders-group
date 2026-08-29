import { mediaUpdateRequestSchema, mediaUploadMetadataSchema } from '@siders/contracts';
import { toMediaResponse } from './media.mapper.js';
import { AppError } from '../../middleware/errorHandler.js';
import { requireUuidParam } from '../../lib/requireParam.js';
function requireCaller(req) {
    const subjectId = req.auth?.subjectId;
    if (!subjectId)
        throw new AppError('Not authenticated', 401, 'unauthenticated');
    return { subjectId };
}
/** Parse, delegate, respond. No `if` about business meaning lives here. */
export function createMediaController(service, env) {
    return {
        async upload(req, res, next) {
            try {
                if (!req.file) {
                    throw new AppError('A file is required', 400, 'file_required');
                }
                const metadata = mediaUploadMetadataSchema.parse(req.body);
                const caller = requireCaller(req);
                const row = await service.upload({
                    tempPath: req.file.path,
                    sizeBytes: req.file.size,
                    declaredMime: req.file.mimetype,
                    originalFilename: req.file.originalname,
                    alt: metadata.alt,
                    caption: metadata.caption,
                    uploadedBy: caller.subjectId,
                });
                res.status(201).json({ success: true, data: toMediaResponse(env, row) });
            }
            catch (err) {
                next(err);
            }
        },
        async get(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const row = await service.get(id);
                res.json({ success: true, data: toMediaResponse(env, row) });
            }
            catch (err) {
                next(err);
            }
        },
        async update(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                const body = mediaUpdateRequestSchema.parse(req.body);
                const row = await service.update(id, body);
                res.json({ success: true, data: toMediaResponse(env, row) });
            }
            catch (err) {
                next(err);
            }
        },
        async remove(req, res, next) {
            try {
                const id = requireUuidParam(req, 'id');
                await service.delete(id);
                res.status(204).end();
            }
            catch (err) {
                next(err);
            }
        },
    };
}
