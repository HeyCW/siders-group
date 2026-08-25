import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: '../../db/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
