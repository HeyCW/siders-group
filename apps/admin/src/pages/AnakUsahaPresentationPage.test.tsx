import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnakUsahaAdminResponse } from '@siders/contracts';
import { AnakUsahaPresentationPage } from './AnakUsahaPresentationPage.js';
import { anakUsahaPresentationApi } from '../lib/anakUsahaApi.js';
import { mediaApi } from '../lib/mediaApi.js';
import { ApiError } from '../lib/api.js';

vi.mock('../lib/anakUsahaApi.js', () => ({
  anakUsahaPresentationApi: {
    list: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    removeProfile: vi.fn(),
    reorderProfiles: vi.fn(),
  },
}));
vi.mock('../lib/mediaApi.js', () => ({ mediaApi: { upload: vi.fn() } }));

afterEach(() => cleanup());

function entryWithoutProfile(overrides: Partial<AnakUsahaAdminResponse> & Pick<AnakUsahaAdminResponse, 'id'>): AnakUsahaAdminResponse {
  return { name: 'Siders News', slug: 'siders-news', profile: null, ...overrides };
}

function entryWithProfile(
  id: string,
  name: string,
  profileOverrides: Partial<NonNullable<AnakUsahaAdminResponse['profile']>> = {},
): AnakUsahaAdminResponse {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    profile: {
      logoUrl: null,
      backgroundColor: '#F7F6F2',
      description: null,
      kind: 'Media Platform',
      links: [],
      sortOrder: 0,
      isActive: true,
      ...profileOverrides,
    },
  };
}

async function renderPage(initial: AnakUsahaAdminResponse[] = []) {
  vi.mocked(anakUsahaPresentationApi.list).mockResolvedValue(initial);
  render(<AnakUsahaPresentationPage />);
  await waitFor(() => expect(anakUsahaPresentationApi.list).toHaveBeenCalled());
}

describe('AnakUsahaPresentationPage — list', () => {
  it('offers "Create profile" for an entry with none, and "Edit" for one with a profile', async () => {
    await renderPage([entryWithoutProfile({ id: 'a', name: 'No Profile Yet' }), entryWithProfile('b', 'Has Profile')]);

    expect(screen.getByRole('button', { name: 'Create profile' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByText('No profile yet')).toBeTruthy();
  });

  it('shows the load error when the fetch fails', async () => {
    vi.mocked(anakUsahaPresentationApi.list).mockRejectedValue(new ApiError('boom', 500));
    render(<AnakUsahaPresentationPage />);

    await screen.findByText('boom');
  });

  it('shows the empty state with no entries', async () => {
    await renderPage([]);

    await screen.findByText('No anak usaha entries yet.');
  });
});

describe('AnakUsahaPresentationPage — create profile', () => {
  it('creates a profile with the selected kind and trimmed links', async () => {
    const withoutProfile = entryWithoutProfile({ id: 'a', name: 'Fresh Brand' });
    await renderPage([withoutProfile]);

    await act(async () => {
      screen.getByRole('button', { name: 'Create profile' }).click();
    });

    // No `htmlFor`/`id` pairs the "Kind" label to its <select> — the form's only combobox.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'News & Community' } });
    await act(async () => {
      screen.getByRole('button', { name: 'Add link' }).click();
    });
    fireEvent.change(screen.getByPlaceholderText('Instagram'), { target: { value: 'Instagram' } });
    fireEvent.change(screen.getByPlaceholderText('https://instagram.com/...'), { target: { value: 'https://instagram.com/fresh ' } });

    vi.mocked(anakUsahaPresentationApi.createProfile).mockResolvedValue(
      entryWithProfile('a', 'Fresh Brand', { kind: 'News & Community', links: [{ label: 'Instagram', href: 'https://instagram.com/fresh' }] }),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(anakUsahaPresentationApi.createProfile).toHaveBeenCalledWith('a', {
      description: null,
      kind: 'News & Community',
      backgroundColor: '#F7F6F2',
      links: [{ label: 'Instagram', href: 'https://instagram.com/fresh' }],
    });
  });

  it('blocks saving while a link has an invalid href', async () => {
    await renderPage([entryWithoutProfile({ id: 'a', name: 'Fresh Brand' })]);

    await act(async () => {
      screen.getByRole('button', { name: 'Create profile' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Add link' }).click();
    });
    fireEvent.change(screen.getByPlaceholderText('Instagram'), { target: { value: 'Bad link' } });
    fireEvent.change(screen.getByPlaceholderText('https://instagram.com/...'), { target: { value: 'javascript:alert(1)' } });

    expect(screen.getByText('Must be a valid http(s) URL.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks saving with an invalid background color', async () => {
    await renderPage([entryWithoutProfile({ id: 'a', name: 'Fresh Brand' })]);

    await act(async () => {
      screen.getByRole('button', { name: 'Create profile' }).click();
    });
    const colorInputs = screen.getAllByPlaceholderText('#F7F6F2');
    fireEvent.change(colorInputs[0]!, { target: { value: 'not-a-color' } });

    expect(screen.getByText('Must be a hex color like #F7F6F2.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not offer the Active toggle for a brand-new profile', async () => {
    await renderPage([entryWithoutProfile({ id: 'a', name: 'Fresh Brand' })]);

    await act(async () => {
      screen.getByRole('button', { name: 'Create profile' }).click();
    });

    expect(screen.queryByText('Active (visible on the public site)')).toBeNull();
  });

  it('uploads a logo and includes its media id on save', async () => {
    await renderPage([entryWithoutProfile({ id: 'a', name: 'Fresh Brand' })]);
    await act(async () => {
      screen.getByRole('button', { name: 'Create profile' }).click();
    });

    vi.mocked(mediaApi.upload).mockResolvedValue({ id: 'media-1', url: 'https://cdn.example.com/logo.png' } as never);
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [file] } });
    });
    await screen.findByRole('button', { name: 'Clear logo' });

    vi.mocked(anakUsahaPresentationApi.createProfile).mockResolvedValue(entryWithProfile('a', 'Fresh Brand'));
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(anakUsahaPresentationApi.createProfile).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ logoMediaId: 'media-1' }),
    );
  });
});

describe('AnakUsahaPresentationPage — edit profile', () => {
  it('updates an existing profile, including the isActive toggle', async () => {
    const withProfile = entryWithProfile('a', 'Existing Brand', { description: 'Old copy', isActive: true });
    await renderPage([withProfile]);

    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });
    // No `htmlFor`/`id` pairs this label to its textarea, so it isn't reachable via
    // `getByLabelText` — found by its display value instead.
    fireEvent.change(screen.getByDisplayValue('Old copy'), { target: { value: 'New copy' } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Active (visible on the public site)'));
    });

    vi.mocked(anakUsahaPresentationApi.updateProfile).mockResolvedValue(
      entryWithProfile('a', 'Existing Brand', { description: 'New copy', isActive: false }),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(anakUsahaPresentationApi.updateProfile).toHaveBeenCalledWith('a', {
      description: 'New copy',
      kind: 'Media Platform',
      backgroundColor: '#F7F6F2',
      links: [],
      isActive: false,
    });
  });

  it('shows a forbidden banner when the update is rejected as a 403', async () => {
    await renderPage([entryWithProfile('a', 'Existing Brand')]);
    await act(async () => {
      screen.getByRole('button', { name: 'Edit' }).click();
    });

    vi.mocked(anakUsahaPresentationApi.updateProfile).mockRejectedValue(new ApiError('Forbidden', 403));
    await act(async () => {
      screen.getByRole('button', { name: 'Save' }).click();
    });

    expect(screen.getByText("You don't have permission to manage anak usaha profiles.")).toBeTruthy();
  });

  it('removes a profile only after confirming, without touching the taxonomy entry', async () => {
    const withProfile = entryWithProfile('a', 'Existing Brand');
    await renderPage([withProfile]);

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });
    expect(anakUsahaPresentationApi.removeProfile).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(anakUsahaPresentationApi.removeProfile).mockResolvedValue(undefined);
    await act(async () => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });

    expect(anakUsahaPresentationApi.removeProfile).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.getByText('No profile yet')).toBeTruthy());
    expect(screen.getByText('Existing Brand')).toBeTruthy();
  });
});

describe('AnakUsahaPresentationPage — reorder', () => {
  it('submits the reordered id list for entries that have a profile', async () => {
    const a = entryWithProfile('a', 'Alpha');
    const b = entryWithProfile('b', 'Beta');
    await renderPage([a, b]);

    const rows = screen.getAllByRole('button', { name: 'Edit' });
    expect(rows).toHaveLength(2);
    const draggableDivs = document.querySelectorAll('[draggable="true"]');
    expect(draggableDivs).toHaveLength(2);

    vi.mocked(anakUsahaPresentationApi.reorderProfiles).mockResolvedValue([b, a]);
    await act(async () => {
      fireEvent.dragStart(draggableDivs[0]!);
    });
    await act(async () => {
      fireEvent.drop(draggableDivs[1]!);
    });

    expect(anakUsahaPresentationApi.reorderProfiles).toHaveBeenCalledWith(['b', 'a']);
  });
});
