import { Router } from 'express';
import type { Database } from '@siders/db';
import { createContactMessageRepository } from './contact.repository.js';
import { createContactMessageService, createPublicContactService } from './contact.service.js';
import { createContactMessageController, createPublicContactController } from './contact.controller.js';
import { requirePermission, requirePublic } from '../../middleware/authorize.js';
import { contactRateLimiter } from '../../middleware/rateLimit.js';

/**
 * The public submission endpoint, mounted at `/contact-messages`. `requirePublic()` +
 * `contactRateLimiter()`, matching `publicPartnerRoutes`' pattern for a declared-public,
 * rate-limited endpoint (specs/contact-messages/spec.md - "Any visitor can submit a contact
 * message without authentication").
 */
export function publicContactRoutes(db: Database) {
  const router = Router();
  const repository = createContactMessageRepository(db);
  const service = createPublicContactService(repository);
  const controller = createPublicContactController(service);

  router.post('/', requirePublic(), contactRateLimiter(), controller.submit);

  return router;
}

/**
 * The admin inbox, mounted at `/admin/contact-messages`. Gated on `contact.manage` rather than
 * `settings.manage` — reading a stranger's submitted contents is a materially different privilege
 * than editing site configuration (design.md - "New contact.manage permission").
 */
export function contactMessageRoutes(db: Database) {
  const router = Router();
  const repository = createContactMessageRepository(db);
  const service = createContactMessageService(repository);
  const controller = createContactMessageController(service);

  router.get('/', requirePermission('contact.manage'), controller.list);
  router.get('/unread-count', requirePermission('contact.manage'), controller.unreadCount);
  router.patch('/:id', requirePermission('contact.manage'), controller.updateStatus);

  return router;
}
