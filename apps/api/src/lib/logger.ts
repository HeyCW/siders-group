import pino, { type LoggerOptions } from 'pino';
import type { Env } from '../config/env.js';

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>) {
  const options: LoggerOptions = { level: env.LOG_LEVEL };
  if (env.NODE_ENV === 'development') {
    options.transport = { target: 'pino-pretty', options: { colorize: true } };
  }
  return pino(options);
}

export type Logger = ReturnType<typeof createLogger>;
