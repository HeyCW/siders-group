import express, { Router, type Request } from 'express';
import multer from 'multer';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createMediaRepository } from './media.repository.js';
import { createMediaService } from './media.service.js';
import { createMediaController } from './media.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { rateLimit, respondWithTooManyRequests, clientIp } from '../../middleware/rateLimit.js';

/**
 * Every other write-heavy endpoint in this API carries a rate limit; this one was missed, and
 * an uploader holding `media.manage` could otherwise loop uploads up to `MEDIA_MAX_BYTES` each
 * until the storage volume fills. Keyed on the caller's own session, not IP — this is an
 * authenticated endpoint, so there is no anonymous-spraying angle to cover the way public reads
 * or sign-in have.
 */
const MEDIA_UPLOAD_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 30 };

function uploaderKey(req: Request): string {
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
 * `limits.fileSize` is the request-body-level check (rejected before the buffer is ever fully
 * read); `storeUpload`'s own `MEDIA_MAX_BYTES` check is the second, explicit one
 * (specs/media-management/spec.md - "Maximum file size" SHALL be "enforced server-side and
 * SHALL NOT rely on any client-side check"). `memoryStorage` is deliberate — `mediaStorage.ts`
 * validates and writes the buffer itself; multer never touches the filesystem.
 */
function createUploadMiddleware(env: Pick<Env, 'MEDIA_MAX_BYTES'>) {
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MEDIA_MAX_BYTES } });
}

export function mediaRoutes(db: Database, env: Env) {
  const router = Router();
  const service = createMediaService(env, createMediaRepository(db));
  const controller = createMediaController(service, env);
  const upload = createUploadMiddleware(env);

  router.post(
    '/',
    requirePermission('media.manage'),
    mediaUploadRateLimiter(),
    upload.single('file'),
    controller.upload,
  );
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
 */
// No `force` flag: `avif` has no mapping at all in that table (it falls through to the
// `application/octet-stream` default), so this adds one rather than overriding one.
express.static.mime.define({ 'image/avif': ['avif'] });

export function mediaFileRoutes(env: Pick<Env, 'MEDIA_STORAGE_PATH'>) {
  const router = Router();
  router.use(requirePublic());
  // Every stored file is one of the allowlisted image types, verified by magic-byte sniffing at
  // upload time, and the extension is derived from that sniff — so the declared `Content-Type`
  // is trustworthy here and a browser must not second-guess it.
  router.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(express.static(env.MEDIA_STORAGE_PATH));
  return router;
}
