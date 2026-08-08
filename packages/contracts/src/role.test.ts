import { describe, expect, it } from 'vitest';
import { roleCreateRequestSchema, roleUpdateRequestSchema } from './role.js';

/**
 * `MANUAL_QA.md` credited `role.service.test.ts` with covering these rules, but that file only
 * ever set `isSystem` on its fixtures — nothing asserted that a request carrying the marker is
 * refused. The rule lives in `.strict()`, so this is where it is testable.
 */
describe('roleCreateRequestSchema', () => {
  it('accepts a well-formed role', () => {
    const parsed = roleCreateRequestSchema.parse({ name: 'Editor', permissions: ['news.manage'] });
    expect(parsed).toEqual({ name: 'Editor', permissions: ['news.manage'] });
  });

  // specs/rbac-management/spec.md - "System-role marker cannot be set through a request".
  it('rejects a client-supplied isSystem marker rather than silently dropping it', () => {
    const result = roleCreateRequestSchema.safeParse({
      name: 'Sneaky',
      permissions: [],
      isSystem: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a client-supplied slug, which would let a request claim the Owner identity', () => {
    const result = roleCreateRequestSchema.safeParse({ name: 'Sneaky', permissions: [], slug: 'owner' });
    expect(result.success).toBe(false);
  });

  // specs/rbac-management/spec.md - "A permission outside the catalog cannot be assigned".
  it('rejects a permission outside the fixed catalog', () => {
    const result = roleCreateRequestSchema.safeParse({ name: 'Editor', permissions: ['news.destroy'] });
    expect(result.success).toBe(false);
  });
});

describe('roleUpdateRequestSchema', () => {
  it('rejects an isSystem marker on update too, not only on create', () => {
    const result = roleUpdateRequestSchema.safeParse({ name: 'Editor', isSystem: true });
    expect(result.success).toBe(false);
  });

  it('rejects an off-catalog permission on update', () => {
    const result = roleUpdateRequestSchema.safeParse({ permissions: ['everything.manage'] });
    expect(result.success).toBe(false);
  });
});
