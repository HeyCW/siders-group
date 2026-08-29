import * as schema from './schema/index.js';
export * from './schema/index.js';
export { newId } from './newId.js';
export interface DbEnv {
    DATABASE_URL: string;
    NODE_ENV?: string;
}
export declare function getDb(env: DbEnv): import("drizzle-orm/mysql2").MySql2Database<typeof schema> & {
    $client: import("mysql2/promise").Pool;
};
export type Database = ReturnType<typeof getDb>;
