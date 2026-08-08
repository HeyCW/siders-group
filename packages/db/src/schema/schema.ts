import { pgSchema } from 'drizzle-orm/pg-core';

/** Every table lives in the `app` schema — never `public` (docs/ARCHITECTURE.md §1, §6.3). */
export const app = pgSchema('app');
