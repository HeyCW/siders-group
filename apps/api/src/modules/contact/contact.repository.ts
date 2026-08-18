import { count, desc, eq, type SQL } from 'drizzle-orm';
import { contactMessages, type Database } from '@siders/db';
import type { ContactMessageStatusFilter } from '@siders/contracts';

export interface ContactMessageRow {
  id: string;
  name: string;
  organisation: string | null;
  email: string;
  subject: string | null;
  message: string;
  status: 'new' | 'read';
  createdAt: Date;
}

export interface SubmitContactMessageInput {
  name: string;
  organisation?: string | undefined;
  email: string;
  subject?: string | undefined;
  message: string;
}

export interface ContactMessageRepository {
  submit(input: SubmitContactMessageInput): Promise<ContactMessageRow>;
  findById(id: string): Promise<ContactMessageRow | null>;
  /** Every message, newest first, optionally filtered by status
   *  (specs/contact-messages/spec.md - "The inbox lists messages filterable by read status,
   *  newest first"). */
  list(filter: ContactMessageStatusFilter): Promise<ContactMessageRow[]>;
  /** Count of messages currently `new` — independent of `list`, so the badge poll never pays for
   *  the full row set (design.md - "Unread count is its own endpoint"). */
  countUnread(): Promise<number>;
  setStatus(id: string, status: 'new' | 'read'): Promise<ContactMessageRow | null>;
}

export function createContactMessageRepository(db: Database): ContactMessageRepository {
  return {
    async submit(input) {
      const [row] = await db
        .insert(contactMessages)
        .values({
          name: input.name,
          organisation: input.organisation ?? null,
          email: input.email,
          subject: input.subject ?? null,
          message: input.message,
        })
        .returning();
      if (!row) throw new Error('contact message insert returned no row');
      return row;
    },

    async findById(id) {
      const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1);
      return row ?? null;
    },

    async list(filter) {
      const where: SQL | undefined = filter === 'all' ? undefined : eq(contactMessages.status, filter);
      const query = db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
      return where ? query.where(where) : query;
    },

    async countUnread() {
      const [row] = await db.select({ value: count() }).from(contactMessages).where(eq(contactMessages.status, 'new'));
      return row?.value ?? 0;
    },

    async setStatus(id, status) {
      const [row] = await db
        .update(contactMessages)
        .set({ status })
        .where(eq(contactMessages.id, id))
        .returning();
      return row ?? null;
    },
  };
}
