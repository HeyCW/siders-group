import type { Request } from 'express';
import { AppError } from '../middleware/errorHandler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(`Missing path parameter: ${name}`, 400, 'bad_request');
  return value;
}

/**
 * Every `:id`-shaped route param in this API identifies a uuid primary key. Without this check
 * a malformed value (`/admin/articles/not-a-uuid`) reaches Drizzle, which hands it to Postgres,
 * which rejects it as invalid input for `uuid` — an error `errorHandler` doesn't recognize, so
 * it fell through to a logged-as-`error` 500 for what is really a client mistake.
 */
export function requireUuidParam(req: Request, name: string): string {
  const value = requireParam(req, name);
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`Path parameter '${name}' must be a valid id`, 400, 'invalid_id');
  }
  return value;
}
