import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/api',
  'apps/admin',
  'apps/web',
  'packages/config',
  'packages/contracts',
  'packages/db',
]);
