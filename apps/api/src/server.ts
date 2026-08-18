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
import { ensureMediaStorageDir } from './lib/mediaStorage.js';
import { assertDatabaseRoleCanReadNewsTables } from './lib/assertDatabaseRole.js';
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
import { mediaFileRoutes, mediaRoutes } from './modules/media/media.routes.js';
import { articleRoutes, publicArticleRoutes } from './modules/articles/article.routes.js';
import { createArticleRepository } from './modules/articles/article.repository.js';
import { createScheduledPublishJob } from './modules/articles/scheduledPublishWorker.js';
import { categoryRoutes } from './modules/categories/category.routes.js';
import { tagRoutes } from './modules/tags/tag.routes.js';
import { curationRoutes, publicHomeRoutes } from './modules/curation/curation.routes.js';
import { reelRoutes, reelsCurationRoutes, publicReelsRoutes } from './modules/reels/reels.routes.js';
import { partnerRoutes, publicPartnerRoutes } from './modules/partners/partner.routes.js';
import { publicEngagementRoutes } from './modules/engagement/engagement.routes.js';
import {
  commentModerationRoutes,
  commentReportRoutes,
  readerModerationRoutes,
} from './modules/moderation/moderation.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { contactMessageRoutes, publicContactRoutes } from './modules/contact/contact.routes.js';

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
  app.use('/media', mediaRoutes(db, env));
  app.use('/media-files', mediaFileRoutes(env));
  app.use('/admin/articles', articleRoutes(db, env));
  app.use('/articles', publicArticleRoutes(db, env));
  // Also at `/articles` — every route it declares is two segments deep, so nothing it matches
  // can collide with `publicArticleRoutes`' `/` and `/:slug` (engagement.routes.ts).
  app.use('/articles', publicEngagementRoutes(db, env));
  app.use('/categories', categoryRoutes(db));
  app.use('/tags', tagRoutes(db));
  app.use('/admin/curation', curationRoutes(db, env));
  app.use('/home', publicHomeRoutes(db, env));
  app.use('/admin/reels-curation', reelsCurationRoutes(db, env));
  app.use('/admin/reels', reelRoutes(db, env));
  app.use('/reels', publicReelsRoutes(db, env));
  app.use('/admin/partners', partnerRoutes(db, env));
  app.use('/partners', publicPartnerRoutes(db, env));
  app.use('/admin/dashboard', analyticsRoutes(db));
  app.use('/admin/comments', commentModerationRoutes(db));
  app.use('/admin/readers', readerModerationRoutes(db));
  app.use('/comments', commentReportRoutes(db));
  app.use('/admin/contact-messages', contactMessageRoutes(db));
  app.use('/contact-messages', publicContactRoutes(db));

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
  // Best-effort: `storeUpload` also creates its dated subdirectory recursively on every write,
  // so a missing root self-heals on first upload regardless. This is the boot-time guarantee
  // for operational visibility (add-news-management-system/tasks.md - 4.3), not a correctness
  // dependency of the upload path itself.
  await ensureMediaStorageDir(env);
  // RLS is enabled with no policies on the news-management tables (tasks.md - 2.7), so this
  // connection must be exempt from it or every read silently returns nothing (tasks.md - 2.9).
  await assertDatabaseRoleCanReadNewsTables(getDatabase(env), logger);
  const app = createServer();
  const scheduler = startScheduler(logger);
  // Every minute, matching design.md - "Scheduling: status flag plus a lazy read-time
  // fallback" - "A cron worker runs every minute". Correctness never depends on this job; see
  // scheduledPublishWorker.ts.
  scheduler.registerJob(
    '* * * * *',
    createScheduledPublishJob(createArticleRepository(getDatabase(env)), env, logger),
  );
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'api listening');
  });
}
