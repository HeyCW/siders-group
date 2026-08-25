/** Shared MySQL error-code checks — every repository that inserts/updates against a unique or
 * foreign-key constrained column translates the raw driver error through these rather than
 * letting it fall through to the generic 500 handler.
 *
 * Ported from the Postgres `pgErrors.ts` this replaces
 * (openspec/changes/migrate-postgres-to-mysql/design.md - "Constraint violations are classified
 * independent of driver representation"). Two things don't carry over directly:
 *
 * - Postgres reports both directions of a foreign-key violation as one SQLSTATE (`23503`).
 *   `mysql2` splits them: `ER_NO_REFERENCED_ROW_2` (1452) when an insert/update references a
 *   missing row, `ER_ROW_IS_REFERENCED_2` (1451) when a delete would orphan a dependent row.
 *   `isForeignKeyViolation` treats both as the same case, matching every call site's existing
 *   assumption that "foreign key violation" doesn't care which direction.
 * - `node-postgres` exposes the violated constraint's name directly as `err.constraint`.
 *   `mysql2` doesn't — the name is only present inside `err.sqlMessage`, in one of two shapes
 *   depending on which kind of violation it is, both captured against a live MySQL 8.0.40
 *   instance while implementing this migration:
 *     - Unique: `Duplicate entry '...' for key 'articles.articles_slug_unique'` (MySQL 8,
 *       table-qualified) or `Duplicate entry '...' for key 'articles_slug_unique'` (MySQL
 *       5.7/MariaDB, bare).
 *     - Foreign key: `Cannot add or update a child row: a foreign key constraint fails
 *       (\`siders\`.\`users\`, CONSTRAINT \`users_role_id_roles_id_fk\` FOREIGN KEY (\`role_id\`)
 *       REFERENCES \`roles\` (\`id\`))` — no `for key '...'` substring at all, so it needed its
 *       own pattern; `violatedConstraint` tries both.
 *   `isUniqueViolationOn` — which exists specifically because a single insert or update can
 *   violate more than one constraint of the same class (`article.repository.ts` inserting a
 *   duplicate slug alongside a bad category id) — and every FK-direction caller
 *   (`guidePick.service.ts`, `partner.service.ts`, `anakUsaha.repository.ts`) depend on both
 *   patterns being covered to keep disambiguating correctly.
 */

const ER_DUP_ENTRY = 1062;
const ER_NO_REFERENCED_ROW_2 = 1452;
const ER_ROW_IS_REFERENCED_2 = 1451;

interface MySqlDriverError {
  errno?: number;
  sqlMessage?: string;
}

function asMySqlError(err: unknown): MySqlDriverError {
  return typeof err === 'object' && err !== null ? (err as MySqlDriverError) : {};
}

export function isUniqueViolation(err: unknown): boolean {
  return asMySqlError(err).errno === ER_DUP_ENTRY;
}

export function isForeignKeyViolation(err: unknown): boolean {
  const errno = asMySqlError(err).errno;
  return errno === ER_NO_REFERENCED_ROW_2 || errno === ER_ROW_IS_REFERENCED_2;
}

const UNIQUE_KEY_NAME_PATTERN = /for key '(?:[^.']+\.)?([^']+)'/;
const FOREIGN_KEY_NAME_PATTERN = /CONSTRAINT `([^`]+)`/;

/**
 * Which constraint actually fired. Necessary wherever one statement can violate more than one
 * constraint of the same class: an article write touches both `articles_slug_unique` and the
 * composite primary keys on `article_categories`/`article_tags`, so keying the translation on
 * the bare error number alone reported a duplicate category id as a slug conflict — and,
 * symmetrically, `guidePick.service.ts`/`partner.service.ts`/`anakUsaha.repository.ts` each need
 * to tell which of two possible foreign keys a single insert or update violated.
 */
export function violatedConstraint(err: unknown): string | undefined {
  const message = asMySqlError(err).sqlMessage;
  if (message === undefined) return undefined;
  return UNIQUE_KEY_NAME_PATTERN.exec(message)?.[1] ?? FOREIGN_KEY_NAME_PATTERN.exec(message)?.[1];
}

export function isUniqueViolationOn(err: unknown, constraintFragment: string): boolean {
  const constraint = violatedConstraint(err);
  return isUniqueViolation(err) && constraint !== undefined && constraint.includes(constraintFragment);
}
