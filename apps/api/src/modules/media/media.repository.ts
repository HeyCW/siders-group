import { eq } from 'drizzle-orm';
import { media, newId, type Database } from '@siders/db';
import { stripUndefined } from '../../lib/stripUndefined.js';

export interface MediaRow {
  id: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
  originalFilename: string;
  alt: string | null;
  caption: string | null;
  uploadedBy: string | null;
  createdAt: Date;
}

export interface CreateMediaInput {
  storagePath: string;
  mime: string;
  sizeBytes: number;
  originalFilename: string;
  alt: string | null;
  caption: string | null;
  uploadedBy: string;
}

export interface UpdateMediaInput {
  alt?: string | null | undefined;
  caption?: string | null | undefined;
}

/** Drizzle queries only — no Express types here. */
export interface MediaRepository {
  create(input: CreateMediaInput): Promise<MediaRow>;
  findById(id: string): Promise<MediaRow | null>;
  update(id: string, input: UpdateMediaInput): Promise<MediaRow>;
  delete(id: string): Promise<void>;
}

export function createMediaRepository(db: Database): MediaRepository {
  return {
    async create(input) {
      const id = newId();
      await db.insert(media).values({ ...input, id });
      const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      if (!row) throw new Error('media missing immediately after insert');
      return row;
    },

    async findById(id) {
      const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      return row ?? null;
    },

    async update(id, input) {
      await db.update(media).set(stripUndefined(input)).where(eq(media.id, id));
      const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
      if (!row) throw new Error('media missing immediately after update');
      return row;
    },

    async delete(id) {
      await db.delete(media).where(eq(media.id, id));
    },
  };
}
