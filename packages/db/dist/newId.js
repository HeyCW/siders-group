import { v7 as uuidv7 } from 'uuid';
/**
 * Generates the primary key for every table, in application code, before the row is written.
 * MySQL has no `uuid` column type and no server-side id generation used here (unlike
 * `defaultRandom()` under Postgres) — see openspec/changes/migrate-postgres-to-mysql/design.md,
 * "primary keys are `char(36)` holding an application-generated UUIDv7".
 *
 * UUIDv7, not v4: its high bits are a millisecond timestamp, so ids generated in sequence sort
 * adjacently and inserts append to the clustered primary-key index instead of scattering across
 * it. `.primaryKey().$defaultFn(newId)` is what wires this into every table.
 */
export function newId() {
    return uuidv7();
}
