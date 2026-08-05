import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

describe('shared config files', () => {
  it.each([
    'tsconfig/base.json',
    'tsconfig/node.json',
    'tsconfig/react.json',
    'eslint/base.cjs',
    'eslint/node.cjs',
    'eslint/react.cjs',
  ])('%s exists', (relativePath) => {
    expect(existsSync(path.join(dir, relativePath))).toBe(true);
  });
});
