import { Router, type Request } from 'express';
import type { Database } from '@siders/db';
import { createStaffRepository } from './staff.repository.js';
import { createStaffService } from './staff.service.js';
import { createStaffController } from './staff.controller.js';
import { requirePermission, requireStaff } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { createSessionRepository } from '../auth/session.repository.js';
import { createAuthService } from '../auth/auth.service.js';
import type { Env } from '../../config/env.js';

const PASSWORD_CHANGE_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 10 };

function callerSubjectKey(req: Request): string {
  return req.auth?.subjectId ?? 'anonymous';
}

/**
 * Caps guesses at the caller's own current password (specs/authentication/spec.md -
 * "Brute-forcing a current password at the change endpoint is throttled"). Keyed on the
 * caller's own account rather than on source alone, since this endpoint is authenticated —
 * there is no email/IP-spraying angle to cover here the way sign-in has. `failuresOnly`
 * because only a *wrong* current password is a guess; a successful change can never repeat.
 * Exported so the scenario tests exercise the real configuration.
 */
export function passwordChangeRateLimiter() {
  return rateLimit({ ...PASSWORD_CHANGE_RATE_LIMIT, keyGenerator: callerSubjectKey, failuresOnly: true });
}

export function staffRoutes(db: Database, env: Env) {
  const router = Router();
  const staffRepository = createStaffRepository(db);
  const authService = createAuthService(createSessionRepository(db), env);
  const service = createStaffService(
    db,
    staffRepository,
    (subjectType, subjectId) => authService.revokeAllForSubject(subjectType, subjectId),
    (subjectType, subjectId, exceptSessionId) =>
      authService.revokeAllForSubjectExcept(subjectType, subjectId, exceptSessionId),
  );
  const controller = createStaffController(service);

  router.post('/', requirePermission('user.manage'), controller.create);
  router.post('/:id/disable', requirePermission('user.manage'), controller.disable);
  router.post('/:id/reset', requirePermission('user.manage'), controller.triggerReset);

  // Exempt from the pending-password-change gate — this is the endpoint that lifts it
  // (specs/authorization/spec.md - "A pending password change blocks every gated endpoint").
  router.post(
    '/me/password',
    requireStaff({ allowPendingPasswordChange: true }),
    passwordChangeRateLimiter(),
    controller.changePassword,
  );

  return router;
}
