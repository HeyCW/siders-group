/**
 * Phusion Passenger entry point (Plesk's Node.js hosting runs `node <startup file>`).
 *
 * Two reasons this file exists rather than pointing Passenger at `src/server.ts` or a
 * compiled `dist/server.js`:
 *
 * 1. The API runs from TypeScript source in production (`package.json` -> `start`), because
 *    `@siders/db` and `@siders/contracts` are consumed as raw `.ts` via the workspace symlink,
 *    so a `tsc` build's output is not loadable by plain node. `node app.js` does not apply
 *    tsx's loader on its own, so it is registered here before anything else is imported.
 * 2. `src/server.ts` only listens when it is the process entry point (`isMainModule`).
 *    Imported from here it would define the server and never bind a port, so the boot sequence
 *    below deliberately mirrors that block — keep the two in sync.
 *
 * Passenger injects `PORT` and expects the app to listen on it; `loadEnv` coerces it.
 */
import { register } from 'tsx/esm/api';

register();

const { loadEnv } = await import('./src/config/env.ts');
const { createLogger } = await import('./src/lib/logger.ts');
const { getDatabase } = await import('./src/lib/db.ts');
const { ensureMediaStorageDir } = await import('./src/lib/mediaStorage.ts');
const { assertDatabaseRoleCanReadNewsTables } = await import('./src/lib/assertDatabaseRole.ts');
const { startScheduler } = await import('./src/lib/scheduler.ts');
const { createServer } = await import('./src/server.ts');
const { createArticleRepository } = await import('./src/modules/articles/article.repository.ts');
const { createScheduledPublishJob } = await import(
  './src/modules/articles/scheduledPublishWorker.ts'
);

const env = loadEnv();
const logger = createLogger(env);

await ensureMediaStorageDir(env);
await assertDatabaseRoleCanReadNewsTables(getDatabase(env), logger);

const app = createServer();

// In-process cron, unguarded by any lock (see lib/scheduler.ts): Passenger must be pinned to a
// single application process for this API, or every replica publishes the same articles.
const scheduler = startScheduler(logger);
scheduler.registerJob(
  '* * * * *',
  createScheduledPublishJob(createArticleRepository(getDatabase(env)), env, logger),
);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
});
