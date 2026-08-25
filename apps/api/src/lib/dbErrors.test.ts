import { describe, expect, it } from 'vitest';
import { isForeignKeyViolation, isUniqueViolation, isUniqueViolationOn, violatedConstraint } from './dbErrors.js';

/**
 * Every message below is a real `mysql2` driver error captured against a live MySQL 8.0.40
 * instance while implementing openspec/changes/migrate-postgres-to-mysql — not hand-constructed.
 * See design.md's "Risks / trade-offs": the `sqlMessage` format is a string-format dependency,
 * not a structured field, so the parser is tested against the driver's actual output rather than
 * an idealized shape.
 */

describe('isUniqueViolation', () => {
  it('recognizes errno 1062 (ER_DUP_ENTRY)', () => {
    const err = {
      errno: 1062,
      code: 'ER_DUP_ENTRY',
      sqlMessage: "Duplicate entry 'Owner' for key 'roles.roles_name_unique'",
    };
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('does not misclassify a foreign-key error', () => {
    const err = { errno: 1452, code: 'ER_NO_REFERENCED_ROW_2' };
    expect(isUniqueViolation(err)).toBe(false);
  });

  it('handles non-error-shaped values without throwing', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('boom')).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe('isForeignKeyViolation', () => {
  it('recognizes errno 1452 (ER_NO_REFERENCED_ROW_2) — insert/update referencing a missing row', () => {
    const err = {
      errno: 1452,
      code: 'ER_NO_REFERENCED_ROW_2',
      sqlMessage:
        'Cannot add or update a child row: a foreign key constraint fails ' +
        '(`siders`.`users`, CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`))',
    };
    expect(isForeignKeyViolation(err)).toBe(true);
  });

  it('recognizes errno 1451 (ER_ROW_IS_REFERENCED_2) — delete that would orphan a dependent row', () => {
    const err = {
      errno: 1451,
      code: 'ER_ROW_IS_REFERENCED_2',
      sqlMessage:
        'Cannot delete or update a parent row: a foreign key constraint fails ' +
        '(`siders`.`users`, CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`))',
    };
    expect(isForeignKeyViolation(err)).toBe(true);
  });

  it('does not misclassify a unique-violation error', () => {
    const err = { errno: 1062, code: 'ER_DUP_ENTRY' };
    expect(isForeignKeyViolation(err)).toBe(false);
  });
});

describe('violatedConstraint', () => {
  it('extracts the constraint name from a table-qualified key (MySQL 8 form)', () => {
    const err = { sqlMessage: "Duplicate entry 'Owner' for key 'roles.roles_name_unique'" };
    expect(violatedConstraint(err)).toBe('roles_name_unique');
  });

  it('extracts the constraint name from a bare key (MySQL 5.7 / MariaDB form)', () => {
    const err = { sqlMessage: "Duplicate entry 'Owner' for key 'roles_name_unique'" };
    expect(violatedConstraint(err)).toBe('roles_name_unique');
  });

  it('returns undefined when there is no sqlMessage', () => {
    expect(violatedConstraint({ errno: 1062 })).toBeUndefined();
  });

  it('extracts the constraint name from a foreign-key violation message', () => {
    // This message has no `for key '...'` substring at all — the unique-violation pattern alone
    // would silently return undefined here, which is exactly what happened before this test was
    // added (surfaced by guidePick.service.test.ts / partner.service.test.ts failing once fake
    // driver errors were updated to a real captured shape).
    const err = {
      errno: 1452,
      sqlMessage:
        'Cannot add or update a child row: a foreign key constraint fails ' +
        '(`siders`.`guide_picks`, CONSTRAINT `guide_picks_photo_media_id_media_id_fk` FOREIGN KEY (`photo_media_id`) REFERENCES `media` (`id`))',
    };
    expect(violatedConstraint(err)).toBe('guide_picks_photo_media_id_media_id_fk');
  });

  it('extracts the constraint name from the delete-direction foreign-key message', () => {
    const err = {
      errno: 1451,
      sqlMessage:
        'Cannot delete or update a parent row: a foreign key constraint fails ' +
        '(`siders`.`users`, CONSTRAINT `users_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`))',
    };
    expect(violatedConstraint(err)).toBe('users_role_id_roles_id_fk');
  });
});

describe('isUniqueViolationOn', () => {
  it('disambiguates which of two constraints fired on the same statement', () => {
    // The exact scenario `isUniqueViolationOn` exists for (article.repository.ts): one insert
    // can violate either the slug's unique constraint or a join-table composite key, and the
    // service must not report the wrong one to the caller.
    const slugConflict = { errno: 1062, sqlMessage: "Duplicate entry 'my-slug' for key 'articles.articles_slug_unique'" };
    const categoryConflict = {
      errno: 1062,
      sqlMessage: "Duplicate entry 'a-b' for key 'article_categories.article_categories_article_id_category_id_pk'",
    };
    expect(isUniqueViolationOn(slugConflict, 'articles_slug_unique')).toBe(true);
    expect(isUniqueViolationOn(slugConflict, 'article_categories')).toBe(false);
    expect(isUniqueViolationOn(categoryConflict, 'articles_slug_unique')).toBe(false);
    expect(isUniqueViolationOn(categoryConflict, 'article_categories')).toBe(true);
  });
});
