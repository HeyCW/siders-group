import { and, asc, eq, sql } from 'drizzle-orm';
import { anakUsaha, anakUsahaProfile, media, type Database } from '@siders/db';
import type { AnakUsahaLink } from '@siders/contracts';
import { AppError } from '../../middleware/errorHandler.js';
import { isForeignKeyViolation, isUniqueViolationOn, violatedConstraint } from '../../lib/pgErrors.js';
import { isExactIdSet, type SortOrderExecutor } from '../../lib/replaceSortOrder.js';
import { stripUndefined } from '../../lib/stripUndefined.js';

export interface AnakUsahaRow {
  id: string;
  name: string;
  slug: string;
}

export interface AnakUsahaProfileFields {
  logoMediaId: string | null;
  /** Joined from `app.media` at read time, mirrors `PartnerRow.logoStoragePath`. `null` exactly
   *  when `logoMediaId` is `null` (design.md - "Logo FK is nullable"). */
  logoStoragePath: string | null;
  description: string | null;
  kind: string;
  links: AnakUsahaLink[];
  sortOrder: number;
  isActive: boolean;
}

export interface AnakUsahaWithProfileRow extends AnakUsahaRow {
  /** `null` when this entry has no profile yet. */
  profile: AnakUsahaProfileFields | null;
}

export interface CreateAnakUsahaProfileInput {
  anakUsahaId: string;
  logoMediaId?: string | null | undefined;
  description?: string | null | undefined;
  kind: string;
  links?: AnakUsahaLink[] | undefined;
}

export interface UpdateAnakUsahaProfileInput {
  logoMediaId?: string | null | undefined;
  description?: string | null | undefined;
  kind?: string | undefined;
  links?: AnakUsahaLink[] | undefined;
  isActive?: boolean | undefined;
}

function slugConflictError(): AppError {
  return new AppError('That slug is already in use by another anak usaha entry', 409, 'slug_conflict');
}

function profileAlreadyExistsError(): AppError {
  return new AppError('This anak usaha entry already has a profile', 409, 'profile_conflict');
}

function unknownAnakUsahaError(): AppError {
  return new AppError('anakUsahaId does not reference an existing anak usaha entry', 400, 'invalid_anak_usaha');
}

function invalidLogoMediaError(): AppError {
  return new AppError('logoMediaId does not reference an existing media item', 400, 'invalid_logo_media');
}

function invalidProfileSetError(): AppError {
  return new AppError(
    'anakUsahaIds must name exactly the current set of anak usaha profiles, no more and no fewer',
    400,
    'invalid_anak_usaha_profile_set',
  );
}

export interface AnakUsahaRepository {
  create(input: { name: string; slug: string }): Promise<AnakUsahaRow>;
  update(id: string, input: { name: string; slug: string }): Promise<AnakUsahaRow>;
  findById(id: string): Promise<AnakUsahaRow | null>;
  slugExists(slug: string, excludeId?: string): Promise<boolean>;
  delete(id: string): Promise<void>;
  list(): Promise<AnakUsahaRow[]>;
  /** Every anak usaha entry, each with its profile or `null` — the single source both the public
   *  listing and the admin presentation screen map from (design.md - "Public data folded into
   *  the existing GET /anak-usaha endpoint"). */
  listWithProfile(): Promise<AnakUsahaWithProfileRow[]>;
  /** One entry with its profile, or `null` if the entry itself does not exist. */
  findWithProfile(anakUsahaId: string): Promise<AnakUsahaWithProfileRow | null>;
  findProfile(anakUsahaId: string): Promise<AnakUsahaProfileFields | null>;
  createProfile(input: CreateAnakUsahaProfileInput): Promise<AnakUsahaProfileFields>;
  updateProfile(anakUsahaId: string, input: UpdateAnakUsahaProfileInput): Promise<AnakUsahaProfileFields>;
  /** Removes only the profile row — the taxonomy entry and any article referencing it are
   *  untouched (specs/anak-usaha-presentation/spec.md - "Deleting a profile removes only the
   *  public presentation"). */
  deleteProfile(anakUsahaId: string): Promise<void>;
  /** Whole-list reorder, same shape and locking strategy as `partner.repository.ts`'s `reorder`,
   *  adapted because this table's primary key column is `anak_usaha_id`, not `id`, so the shared
   *  `replaceSortOrder` helper (which assumes an `id` column) does not apply directly. */
  reorderProfiles(anakUsahaIds: string[]): Promise<AnakUsahaWithProfileRow[]>;
}

/**
 * Deleting an anak usaha never touches `articles` directly — `articles.anak_usaha_id` is
 * `ON DELETE SET NULL`, which is what detaches the association without deleting or unpublishing
 * the article (specs/anak-usaha-management/spec.md - "Deleting an anak usaha detaches it without
 * deleting articles").
 */
const JOINED_COLUMNS = {
  id: anakUsaha.id,
  name: anakUsaha.name,
  slug: anakUsaha.slug,
  profileAnakUsahaId: anakUsahaProfile.anakUsahaId,
  logoMediaId: anakUsahaProfile.logoMediaId,
  logoStoragePath: media.storagePath,
  description: anakUsahaProfile.description,
  kind: anakUsahaProfile.kind,
  links: anakUsahaProfile.links,
  sortOrder: anakUsahaProfile.sortOrder,
  isActive: anakUsahaProfile.isActive,
};

function toWithProfileRow(row: {
  id: string;
  name: string;
  slug: string;
  profileAnakUsahaId: string | null;
  logoMediaId: string | null;
  logoStoragePath: string | null;
  description: string | null;
  kind: string | null;
  links: unknown;
  sortOrder: number | null;
  isActive: boolean | null;
}): AnakUsahaWithProfileRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    profile:
      row.profileAnakUsahaId === null
        ? null
        : {
            logoMediaId: row.logoMediaId,
            logoStoragePath: row.logoStoragePath,
            description: row.description,
            kind: row.kind ?? '',
            links: (row.links ?? []) as AnakUsahaLink[],
            sortOrder: row.sortOrder ?? 0,
            isActive: row.isActive ?? false,
          },
  };
}

async function listWithProfileJoined(executor: SortOrderExecutor): Promise<AnakUsahaWithProfileRow[]> {
  const rows = await executor
    .select(JOINED_COLUMNS)
    .from(anakUsaha)
    .leftJoin(anakUsahaProfile, eq(anakUsahaProfile.anakUsahaId, anakUsaha.id))
    .leftJoin(media, eq(media.id, anakUsahaProfile.logoMediaId))
    .orderBy(asc(anakUsahaProfile.sortOrder), asc(anakUsaha.createdAt));
  return rows.map(toWithProfileRow);
}

async function findWithProfileJoined(
  executor: SortOrderExecutor,
  anakUsahaId: string,
): Promise<AnakUsahaWithProfileRow | null> {
  const [row] = await executor
    .select(JOINED_COLUMNS)
    .from(anakUsaha)
    .leftJoin(anakUsahaProfile, eq(anakUsahaProfile.anakUsahaId, anakUsaha.id))
    .leftJoin(media, eq(media.id, anakUsahaProfile.logoMediaId))
    .where(eq(anakUsaha.id, anakUsahaId))
    .limit(1);
  return row ? toWithProfileRow(row) : null;
}

async function findProfileJoined(
  executor: SortOrderExecutor,
  anakUsahaId: string,
): Promise<AnakUsahaProfileFields | null> {
  const [row] = await executor
    .select({
      logoMediaId: anakUsahaProfile.logoMediaId,
      logoStoragePath: media.storagePath,
      description: anakUsahaProfile.description,
      kind: anakUsahaProfile.kind,
      links: anakUsahaProfile.links,
      sortOrder: anakUsahaProfile.sortOrder,
      isActive: anakUsahaProfile.isActive,
    })
    .from(anakUsahaProfile)
    .leftJoin(media, eq(media.id, anakUsahaProfile.logoMediaId))
    .where(eq(anakUsahaProfile.anakUsahaId, anakUsahaId))
    .limit(1);
  if (!row) return null;
  return {
    logoMediaId: row.logoMediaId,
    logoStoragePath: row.logoStoragePath,
    description: row.description,
    kind: row.kind,
    links: (row.links ?? []) as AnakUsahaLink[],
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export function createAnakUsahaRepository(db: Database): AnakUsahaRepository {
  return {
    async create(input) {
      try {
        const [row] = await db.insert(anakUsaha).values(input).returning();
        if (!row) throw new Error('anak usaha insert returned no row');
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, 'anak_usaha_slug_unique')) throw slugConflictError();
        throw err;
      }
    },

    async update(id, input) {
      try {
        const [row] = await db.update(anakUsaha).set(input).where(eq(anakUsaha.id, id)).returning();
        if (!row) throw new Error('anak usaha missing immediately after update');
        return row;
      } catch (err) {
        if (isUniqueViolationOn(err, 'anak_usaha_slug_unique')) throw slugConflictError();
        throw err;
      }
    },

    async findById(id) {
      const [row] = await db.select().from(anakUsaha).where(eq(anakUsaha.id, id)).limit(1);
      return row ?? null;
    },

    async slugExists(slug, excludeId) {
      const condition = excludeId
        ? and(eq(anakUsaha.slug, slug), sql`${anakUsaha.id} != ${excludeId}`)
        : eq(anakUsaha.slug, slug);
      const [row] = await db.select({ id: anakUsaha.id }).from(anakUsaha).where(condition).limit(1);
      return row !== undefined;
    },

    async delete(id) {
      await db.delete(anakUsaha).where(eq(anakUsaha.id, id));
    },

    async list() {
      return db.select().from(anakUsaha);
    },

    listWithProfile() {
      return listWithProfileJoined(db);
    },

    findWithProfile(anakUsahaId) {
      return findWithProfileJoined(db, anakUsahaId);
    },

    findProfile(anakUsahaId) {
      return findProfileJoined(db, anakUsahaId);
    },

    async createProfile(input) {
      try {
        // Same read-then-write-under-lock shape as `partner.repository.ts`'s `create`: two
        // concurrent creates outside a transaction could read the same `max(sortOrder)` and
        // collide, since `sortOrder` carries no unique constraint.
        await db.transaction(async (tx) => {
          await tx.execute(sql`LOCK TABLE app.anak_usaha_profile IN SHARE ROW EXCLUSIVE MODE`);
          const [maxRow] = await tx
            .select({ nextSortOrder: sql<number>`coalesce(max(${anakUsahaProfile.sortOrder}), -1) + 1` })
            .from(anakUsahaProfile);
          if (!maxRow) throw new Error('sortOrder aggregate returned no row');
          await tx.insert(anakUsahaProfile).values({
            anakUsahaId: input.anakUsahaId,
            logoMediaId: input.logoMediaId ?? null,
            description: input.description ?? null,
            kind: input.kind,
            links: input.links ?? [],
            sortOrder: maxRow.nextSortOrder,
          });
        });
      } catch (err) {
        if (isUniqueViolationOn(err, 'anak_usaha_profile_pkey')) throw profileAlreadyExistsError();
        if (isForeignKeyViolation(err)) {
          const constraint = violatedConstraint(err) ?? '';
          if (constraint.includes('logo_media_id')) throw invalidLogoMediaError();
          if (constraint.includes('anak_usaha_id')) throw unknownAnakUsahaError();
        }
        throw err;
      }
      const profile = await findProfileJoined(db, input.anakUsahaId);
      if (!profile) throw new Error('anak usaha profile missing immediately after insert');
      return profile;
    },

    async updateProfile(anakUsahaId, input) {
      try {
        await db
          .update(anakUsahaProfile)
          .set({ ...stripUndefined(input), updatedAt: new Date() })
          .where(eq(anakUsahaProfile.anakUsahaId, anakUsahaId));
      } catch (err) {
        if (isForeignKeyViolation(err) && violatedConstraint(err)?.includes('logo_media_id')) {
          throw invalidLogoMediaError();
        }
        throw err;
      }
      const profile = await findProfileJoined(db, anakUsahaId);
      if (!profile) throw new Error('anak usaha profile missing immediately after update');
      return profile;
    },

    async deleteProfile(anakUsahaId) {
      await db.delete(anakUsahaProfile).where(eq(anakUsahaProfile.anakUsahaId, anakUsahaId));
    },

    reorderProfiles(anakUsahaIds) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`LOCK TABLE app.anak_usaha_profile IN EXCLUSIVE MODE`);
        const current = await tx.execute(sql`select anak_usaha_id as id from app.anak_usaha_profile`);
        const currentIds = current.rows.map((r) => (r as { id: string }).id);
        if (!isExactIdSet(currentIds, anakUsahaIds)) throw invalidProfileSetError();

        for (const [index, id] of anakUsahaIds.entries()) {
          await tx
            .update(anakUsahaProfile)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(eq(anakUsahaProfile.anakUsahaId, id));
        }

        return listWithProfileJoined(tx);
      });
    },
  };
}
