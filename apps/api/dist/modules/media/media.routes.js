import express, { Router } from 'express';
import multer from 'multer';
import { createMediaRepository } from './media.repository.js';
import { createMediaService } from './media.service.js';
import { createMediaController } from './media.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { rateLimit, respondWithTooManyRequests, clientIp } from '../../middleware/rateLimit.js';
import { MEDIA_TEMP_SUBDIR } from '../../lib/mediaStorage.js';
/**
 * Every other write-heavy endpoint in this API carries a rate limit; this one was missed, and
 * an uploader holding `media.manage` could otherwise loop uploads up to the video maximum each
 * until the storage volume fills. Keyed on the caller's own session, not IP — this is an
 * authenticated endpoint, so there is no anonymous-spraying angle to cover the way public reads
 * or sign-in have.
 */
const MEDIA_UPLOAD_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };
function uploaderKey(req) {
    return req.auth?.subjectId ?? clientIp(req);
}
function mediaUploadRateLimiter() {
    return rateLimit({
        name: 'media-upload',
        ...MEDIA_UPLOAD_RATE_LIMIT,
        keyGenerator: uploaderKey,
        onLimited: respondWithTooManyRequests,
    });
}
/**
 * `limits.fileSize` is an outer bound applied during transfer, before the file's kind is known —
 * it is set to the larger of the two configured maxima so neither an image nor a video is
 * rejected here on size alone. `storeUpload`'s own per-kind check is the real, explicit one
 * (specs/media-management/spec.md - "Maximum file size" SHALL be "enforced server-side and SHALL
 * NOT rely on any client-side check"). `diskStorage` — rather than `memoryStorage` — is
 * deliberate: a video-sized upload held whole in memory would scale the process's heap with
 * upload size, which several uploads in flight at once can exhaust
 * (specs/media-management/spec.md - "An upload is not held entirely in memory"). Multer writes
 * the file to `MEDIA_STORAGE_PATH/.tmp/`, a location `mediaFileRoutes` never serves, and
 * `storeUpload` sniffs and validates from there before moving the file into its final location.
 */
function createUploadMiddleware(env) {
    const storage = multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, `${env.MEDIA_STORAGE_PATH}/${MEDIA_TEMP_SUBDIR}`),
        // The generated name is never trusted as the final stored name — `storeUpload` renames from
        // here using its own server-generated identifier and sniffed extension. This name only needs
        // to be collision-free within the temp directory for the lifetime of one request.
        filename: (_req, _file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    });
    return multer({
        storage,
        limits: { fileSize: Math.max(env.MEDIA_MAX_IMAGE_BYTES, env.MEDIA_MAX_VIDEO_BYTES) },
    });
}
export function mediaRoutes(db, env) {
    const router = Router();
    const service = createMediaService(env, createMediaRepository(db));
    const controller = createMediaController(service, env);
    const upload = createUploadMiddleware(env);
    router.post('/', requirePermission('media.manage'), mediaUploadRateLimiter(), upload.single('file'), controller.upload);
    router.get('/:id', requirePermission('media.manage'), controller.get);
    router.patch('/:id', requirePermission('media.manage'), controller.update);
    router.delete('/:id', requirePermission('media.manage'), controller.remove);
    return router;
}
/**
 * Public, anonymous file serving for uploaded media — an `<img>` tag on the public site loads
 * these with no session (specs/media-management/spec.md - "Public URL is derived from the
 * media record"). Wrapped in a router with an explicit `requirePublic()` layer first: mounting
 * `express.static` directly would leave it with no authorization declaration, which
 * `auditAuthorizationDeclarations` treats as undeclared rather than as implicitly public
 * (apps/api/src/middleware/authorize.ts - "silence is a denial, not a grant").
 *
 * This is the concrete implementation of "serve stored media publicly"; a reverse proxy or CDN
 * serving `MEDIA_STORAGE_PATH` directly in production is a deployment-level substitute for this
 * route, not a code change — `MEDIA_PUBLIC_BASE_URL` simply points wherever the files are
 * actually served from.
 */
/**
 * `express.static` derives `Content-Type` from the file extension through `send`'s bundled
 * `mime@1.x` table, which predates AVIF and has no entry for it — so a stored `.avif` was served
 * as `application/octet-stream`. On its own that was survivable because browsers sniffed the
 * bytes anyway, but combined with the `nosniff` header below it becomes fatal: Chrome's ORB
 * refuses a `nosniff` response whose declared type is not an image for an `<img>` load, so every
 * AVIF upload would render broken. `image/avif` is an explicitly accepted upload type
 * (`mediaStorage.ts` - SIGNATURES; specs/media-management/spec.md - "Accepted media types"), so
 * the table has to know it before `nosniff` can be safe.
 *
 * `video/mp4` needed no equivalent fix when it was added: `mime@1.6.0`'s bundled table already
 * maps `.mp4` to `video/mp4` (checked directly against the installed table before relying on it),
 * so this `.define()` call stays AVIF-only rather than growing a second entry.
 */
// No `force` flag: `avif` has no mapping at all in that table (it falls through to the
// `application/octet-stream` default), so this adds one rather than overriding one.
express.static.mime.define({ 'image/avif': ['avif'] });
export function mediaFileRoutes(env) {
    const router = Router();
    router.use(requirePublic());
    // Every stored file is one of the allowlisted image or video types, verified by magic-byte
    // sniffing at upload time, and the extension is derived from that sniff — so the declared
    // `Content-Type` is trustworthy here and a browser must not second-guess it. `express.static`
    // also answers Range requests natively, which is what gives a served video its seek bar
    // (specs/media-management/spec.md - "Stored video supports seeking").
    router.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        next();
    });
    router.use(express.static(env.MEDIA_STORAGE_PATH));
    return router;
}
