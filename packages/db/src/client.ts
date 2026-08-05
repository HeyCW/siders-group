import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export interface DbEnv {
  DATABASE_URL: string;
}

export function getDb(env: DbEnv) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof getDb>;
