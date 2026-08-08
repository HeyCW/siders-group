import { Router } from 'express';
import type { Database } from '@siders/db';
import { requireStaff } from '../../middleware/authorize.js';
import { createUserController } from './user.controller.js';
import { createUserService } from './user.service.js';
import { createUserRepository } from './user.repository.js';

export function userRoutes(db: Database): Router {
  const router = Router();
  const controller = createUserController(createUserService(createUserRepository(db)));

  // authenticate runs globally now (server.ts); rejection for an anonymous caller moves
  // from identification to this declaration, preserving the route's existing 401 outcome.
  // Exempt from the pending-password-change gate so the forced-change screen has an
  // identity to render (specs/authorization/spec.md - "The password-change endpoint stays
  // reachable").
  router.get('/me', requireStaff({ allowPendingPasswordChange: true }), controller.getMe);

  return router;
}
