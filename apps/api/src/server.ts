import { pathToFileURL } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { startScheduler } from './lib/scheduler.js';
import { requestId } from './middleware/requestId.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { userRoutes } from './modules/users/user.routes.js';

export function createServer(): Express {
  const env = loadEnv();
  const logger = createLogger(env);

  const app = express();
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: [env.APP_ORIGIN, env.ADMIN_ORIGIN], credentials: true }));
  app.use(express.json());

  app.use('/health', healthRoutes());
  app.use('/users', userRoutes());

  app.use(createErrorHandler(logger));

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
