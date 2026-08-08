import { pathToFileURL } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { startScheduler } from './lib/scheduler.js';
import { createCsrfMiddleware } from './lib/csrf.js';
import { getDatabase } from './lib/db.js';
import { requestId } from './middleware/requestId.js';
import { createAuthenticate } from './middleware/authenticate.js';
import { auditAuthorizationDeclarations } from './middleware/authorize.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { googleAuthRoutes } from './modules/auth/google.routes.js';
import { staffRoutes } from './modules/staff/staff.routes.js';
import { roleRoutes } from './modules/roles/role.routes.js';

export function createServer(): Express {
  const env = loadEnv();
  const logger = createLogger(env);
  const db = getDatabase(env);

  const app = express();
  // Without this, `req.ip` behind a load balancer is the balancer's address, so every
  // IP-keyed rate limit collapses into a single shared bucket. Defaults to trusting nothing.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: [env.APP_ORIGIN, env.ADMIN_ORIGIN], credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  // Identification (never rejects) runs before the CSRF check (which only cares whether a
  // session cookie is present) and before every route's own authorization declaration.
  app.use(createAuthenticate(env));
  app.use(createCsrfMiddleware(env));

  app.use('/health', healthRoutes());
  app.use('/users', userRoutes(db));
  app.use('/auth', authRoutes(db, env));
  app.use('/auth', googleAuthRoutes(db, env));
  app.use('/staff', staffRoutes(db, env));
  app.use('/roles', roleRoutes(db));

  app.use(createErrorHandler(logger));

  // Fails boot rather than serving a route nobody declared public/reader/staff/permission
  // (specs/authorization/spec.md - "Startup fails on an undeclared route").
  auditAuthorizationDeclarations(app);

  return app;
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const env = loadEnv();
  const logger = createLogger(env);
  const app = createServer();
  startScheduler(logger);
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'api listening');
  });
}
