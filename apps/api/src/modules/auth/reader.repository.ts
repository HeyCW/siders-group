import { readers, type Database } from '@siders/db';

export interface UpsertReaderInput {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl?: string | undefined;
}

export interface ReaderRow {
  id: string;
  googleSub: string;
  status: 'active' | 'banned';
}

export interface ReaderRepository {
  upsertByGoogleSub(input: UpsertReaderInput): Promise<ReaderRow>;
}

/** Upsert keyed on `google_sub` — never on email (specs/authentication/spec.md - "Reader sign-in via Google"). */
export function createReaderRepository(db: Database): ReaderRepository {
  return {
    async upsertByGoogleSub(input) {
      const [row] = await db
        .insert(readers)
        .values({
          googleSub: input.googleSub,
          email: input.email,
          emailVerified: input.emailVerified,
          name: input.name,
          avatarUrl: input.avatarUrl ?? null,
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: readers.googleSub,
          set: {
            email: input.email,
            emailVerified: input.emailVerified,
            name: input.name,
            avatarUrl: input.avatarUrl ?? null,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: readers.id, googleSub: readers.googleSub, status: readers.status });
      if (!row) throw new Error('reader upsert returned no row');
      return row;
    },
  };
}
