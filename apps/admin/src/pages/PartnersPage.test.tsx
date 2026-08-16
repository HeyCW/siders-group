import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PartnerResponse } from '@siders/contracts';
import { PartnersPage } from './PartnersPage.js';
import { partnersApi } from '../lib/partnersApi.js';
import { mediaApi } from '../lib/mediaApi.js';

vi.mock('../lib/partnersApi.js', () => ({
  partnersApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  },
}));
vi.mock('../lib/mediaApi.js', () => ({ mediaApi: { upload: vi.fn() } }));

afterEach(() => cleanup());

function partner(overrides: Partial<PartnerResponse> & Pick<PartnerResponse, 'id'>): PartnerResponse {
  return {
    name: 'Acme Corp',
    logoUrl: 'https://cdn.example.com/acme.webp',
    websiteUrl: 'https://acme.example.com',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(initial: PartnerResponse[] = []) {
  vi.mocked(partnersApi.list).mockResolvedValue(initial);
  render(<PartnersPage />);
  await waitFor(() => expect(partnersApi.list).toHaveBeenCalled());
}

describe('PartnersPage — new partner form', () => {
  /** specs/partner-management/spec.md - "A partner requires a logo". */
  it('keeps "Add partner" disabled until name, a valid website URL, and a logo are all present', async () => {
    await renderPage();

    const addButton = screen.getByRole('button', { name: 'Add partner' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } });
    fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'https://acme.example.com' } });
    expect(addButton.disabled).toBe(true);

    vi.mocked(mediaApi.upload).mockResolvedValue({
      id: 'media-1',
      url: 'https://cdn.example.com/acme.webp',
    } as never);
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [file] } });
    });

    await waitFor(() => expect(addButton.disabled).toBe(false));
  });

  it('shows validation feedback for an invalid website URL', async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText('Website URL'), { target: { value: 'not-a-url' } });

    expect(screen.getByText('Enter a valid http(s) URL.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add partner' }) as HTMLButtonElement).disabled).toBe(true);
  });

  /** The form validates by the same `isHttpUrl` the request contract refines on, so a scheme the
   *  server would reject is caught here rather than coming back as an opaque 400
   *  (specs/partner-management/spec.md - "The admin surface rejects it before submission"). */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'rejects the non-http(s) scheme %s',
    async (value) => {
      await renderPage();

      fireEvent.change(screen.getByLabelText('Website URL'), { target: { value } });

      expect(screen.getByText('Enter a valid http(s) URL.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Add partner' }) as HTMLButtonElement).disabled).toBe(true);
    },
  );
});

describe('PartnersPage — edit form', () => {
  /** The edit form validates the website URL by the same rule as the create form, rather than
   *  letting the server's 400 be the only feedback. */
  it('blocks saving an edit whose website URL is invalid, with field-level feedback', async () => {
    await renderPage([partner({ id: 'a' })]);

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });

    // Both the create form and the open edit row label a field "Website URL"; this is the edit
    // row's, distinguished by the per-partner id the page assigns it.
    const urlInput = screen
      .getAllByLabelText('Website URL')
      .find((el) => el.id === 'edit-partner-website-url-a') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'javascript:alert(1)' } });

    expect(screen.getByText('Enter a valid http(s) URL.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(partnersApi.update).not.toHaveBeenCalled();

    fireEvent.change(urlInput, { target: { value: 'https://acme.example.com' } });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('PartnersPage — active toggle', () => {
  it('toggles a partner between active and inactive', async () => {
    const active = partner({ id: 'a', isActive: true });
    await renderPage([active]);

    vi.mocked(partnersApi.update).mockResolvedValue({ ...active, isActive: false });

    await act(async () => {
      screen.getByRole('button', { name: 'Active' }).click();
    });

    expect(partnersApi.update).toHaveBeenCalledWith('a', { isActive: false });
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeTruthy();
  });
});

describe('PartnersPage — reorder', () => {
  it('submits the full reordered id list on drop', async () => {
    const a = partner({ id: 'a', name: 'Alpha', sortOrder: 0 });
    const b = partner({ id: 'b', name: 'Beta', sortOrder: 1 });
    await renderPage([a, b]);

    vi.mocked(partnersApi.reorder).mockResolvedValue([
      { ...b, sortOrder: 0 },
      { ...a, sortOrder: 1 },
    ]);

    const rows = screen.getAllByRole('listitem');
    await act(async () => {
      fireEvent.dragStart(rows[0]!);
    });
    await act(async () => {
      fireEvent.drop(rows[1]!);
    });

    expect(partnersApi.reorder).toHaveBeenCalledWith(['b', 'a']);
  });
});
