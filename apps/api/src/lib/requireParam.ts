import type { Request } from 'express';
import { AppError } from '../middleware/errorHandler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw new AppError(`Missing path parameter: ${name}`, 400, 'bad_request');
  return value;
}

/**
 * Every `:id`-shaped route param in this API identifies a uuid primary key. Primary keys are
 * `char(36)` in MySQL, not a database-enforced `uuid` type (openspec/changes/migrate-postgres-to-mysql
 * - "primary keys are `char(36)`..."), so a malformed value (`/admin/articles/not-a-uuid`) has no
 * driver-level backstop at all — without this check it would simply reach Drizzle as an ordinary
 * string, match no row, and surface as an ambiguous 404 rather than the precise `400 invalid_id`
 * a client mistake deserves.
 */
export function requireUuidParam(req: Request, name: string): string {
  const value = requireParam(req, name);
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`Path parameter '${name}' must be a valid id`, 400, 'invalid_id');
  }
  return value;
}
