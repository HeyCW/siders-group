import express, { Router } from 'express';
import multer from 'multer';
import type { Database } from '@siders/db';
import type { Env } from '../../config/env.js';
import { createMediaRepository } from './media.repository.js';
import { createMediaService } from './media.service.js';
import { createMediaController } from './media.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';

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

  router.post('/', requirePermission('media.manage'), upload.single('file'), controller.upload);
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
export function mediaFileRoutes(env: Pick<Env, 'MEDIA_STORAGE_PATH'>) {
  const router = Router();
  router.use(requirePublic());
  router.use(express.static(env.MEDIA_STORAGE_PATH));
  return router;
}
