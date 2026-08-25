import cron, { type ScheduledTask } from 'node-cron';
import type { Logger } from './logger.js';

export interface SchedulerHandle {
  /** Registers a cron job. The scheduled-publish worker (task 5.1) is the first caller. */
  registerJob: (expression: string, job: () => Promise<void> | void) => void;
  stop: () => void;
}

/**
 * Boots the in-process cron scheduler. No jobs are registered by this change —
 * the scheduled-publish worker (add-news-management-system task 5.1) calls
 * `registerJob` after this returns.
 *
 * Decision: in-process node-cron, not a separate worker process (see
 * design.md "Cron: in-process node-cron"). If the API ever runs multiple
 * replicas, guard registered jobs with a MySQL named advisory lock
 * (`GET_LOCK`/`RELEASE_LOCK` — see `lib/tableWriteLock.ts`, built for a
 * different purpose but the same primitive applies here).
 */
export function startScheduler(logger: Logger): SchedulerHandle {
  const tasks: ScheduledTask[] = [];

  function registerJob(expression: string, job: () => Promise<void> | void): void {
    const task = cron.schedule(expression, () => {
      Promise.resolve(job()).catch((err) => logger.error({ err }, 'scheduled job failed'));
    });
    tasks.push(task);
    logger.info({ expression }, 'scheduled job registered');
  }

  return {
    registerJob,
    stop: () => tasks.forEach((task) => task.stop()),
  };
}
