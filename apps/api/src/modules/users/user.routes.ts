import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { createUserController } from './user.controller.js';
import { createUserService } from './user.service.js';
import { createUserRepository } from './user.repository.js';

export function userRoutes(): Router {
  const router = Router();
  const controller = createUserController(createUserService(createUserRepository()));

  router.get('/me', authenticate, controller.getMe);

  return router;
}
