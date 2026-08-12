/** Shared Postgres error-code checks — every repository that inserts/updates against a unique or
 * foreign-key constrained column translates the raw driver error through these rather than
 * letting it fall through to the generic 500 handler. */

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface PgError {
  code?: string;
  /** `node-postgres` surfaces the violated constraint's name here for 23505/23503. */
  constraint?: string;
}

function asPgError(err: unknown): PgError {
  return typeof err === 'object' && err !== null ? (err as PgError) : {};
}

export function isUniqueViolation(err: unknown): boolean {
  return asPgError(err).code === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return asPgError(err).code === FOREIGN_KEY_VIOLATION;
}

/**
 * Which constraint actually fired. Necessary wherever one statement can violate more than one
 * constraint of the same class: an article write touches both `articles_slug_unique` and the
 * composite primary keys on `article_categories`/`article_tags`, so keying the translation on
 * the bare SQLSTATE reported a duplicate category id as a slug conflict.
 */
export function violatedConstraint(err: unknown): string | undefined {
  return asPgError(err).constraint;
}

export function isUniqueViolationOn(err: unknown, constraintFragment: string): boolean {
  const constraint = violatedConstraint(err);
  return isUniqueViolation(err) && constraint !== undefined && constraint.includes(constraintFragment);
}
