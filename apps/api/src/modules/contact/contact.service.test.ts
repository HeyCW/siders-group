import { describe, expect, it } from 'vitest';
import { createContactMessageService, createPublicContactService } from './contact.service.js';
import type { ContactMessageRepository, ContactMessageRow } from './contact.repository.js';

const UNKNOWN_ID = '11111111-1111-1111-1111-000000000099';

function row(overrides: Partial<ContactMessageRow> & Pick<ContactMessageRow, 'id'>): ContactMessageRow {
  return {
    name: 'Jamie Doe',
    organisation: null,
    email: 'jamie@example.com',
    subject: null,
    message: 'Hello, I have a question.',
    status: 'new',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createFakeRepository(initial: ContactMessageRow[] = []) {
  let stored = [...initial];

  const repository: ContactMessageRepository = {
    async submit(input) {
      const created = row({
        id: `generated-${stored.length}`,
        name: input.name,
        organisation: input.organisation ?? null,
        email: input.email,
        subject: input.subject ?? null,
        message: input.message,
      });
      stored.push(created);
      return created;
    },
    async findById(id) {
      return stored.find((r) => r.id === id) ?? null;
    },
    async list(filter) {
      const filtered = filter === 'all' ? stored : stored.filter((r) => r.status === filter);
      return [...filtered].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async countUnread() {
      return stored.filter((r) => r.status === 'new').length;
    },
    async setStatus(id, status) {
      const existing = stored.find((r) => r.id === id);
      if (!existing) return null;
      const updated = { ...existing, status };
      stored = stored.map((r) => (r.id === id ? updated : r));
      return updated;
    },
  };

  return { repository, getStored: () => stored };
}

describe('createPublicContactService', () => {
  it('submits a message through the repository', async () => {
    const { repository, getStored } = createFakeRepository();
    const service = createPublicContactService(repository);

    const created = await service.submit({
      name: 'Jamie Doe',
      email: 'jamie@example.com',
      message: 'Hello, I have a question.',
    });

    expect(created.status).toBe('new');
    expect(getStored()).toHaveLength(1);
  });
});

describe('createContactMessageService — list and count', () => {
  it('lists messages newest-first', async () => {
    const older = row({ id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') });
    const newer = row({ id: 'b', createdAt: new Date('2026-01-02T00:00:00Z') });
    const { repository } = createFakeRepository([older, newer]);
    const service = createContactMessageService(repository);

    const result = await service.list('all');

    expect(result.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('filters to only unread messages', async () => {
    const unread = row({ id: 'a', status: 'new' });
    const read = row({ id: 'b', status: 'read' });
    const { repository } = createFakeRepository([unread, read]);
    const service = createContactMessageService(repository);

    const result = await service.list('new');

    expect(result.map((m) => m.id)).toEqual(['a']);
  });

  it('counts only unread messages, independent of the list filter', async () => {
    const { repository } = createFakeRepository([
      row({ id: 'a', status: 'new' }),
      row({ id: 'b', status: 'new' }),
      row({ id: 'c', status: 'read' }),
    ]);
    const service = createContactMessageService(repository);

    expect(await service.countUnread()).toBe(2);
  });
});

describe('createContactMessageService — read state toggle', () => {
  it('marks a new message read', async () => {
    const { repository } = createFakeRepository([row({ id: 'a', status: 'new' })]);
    const service = createContactMessageService(repository);

    const updated = await service.setStatus('a', 'read');

    expect(updated.status).toBe('read');
  });

  it('marks a read message unread again', async () => {
    const { repository } = createFakeRepository([row({ id: 'a', status: 'read' })]);
    const service = createContactMessageService(repository);

    const updated = await service.setStatus('a', 'new');

    expect(updated.status).toBe('new');
  });

  it('rejects setting the status of an unknown message', async () => {
    const { repository } = createFakeRepository([]);
    const service = createContactMessageService(repository);

    await expect(service.setStatus(UNKNOWN_ID, 'read')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});
