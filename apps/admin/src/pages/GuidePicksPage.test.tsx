import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { GuidePickResponse } from '@siders/contracts';
import { GuidePicksPage } from './GuidePicksPage.js';
import { guidePicksApi } from '../lib/guidePicksApi.js';
import { mediaApi } from '../lib/mediaApi.js';

vi.mock('../lib/guidePicksApi.js', () => ({
  guidePicksApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  },
}));
vi.mock('../lib/mediaApi.js', () => ({ mediaApi: { upload: vi.fn() } }));

afterEach(() => cleanup());

function guidePick(overrides: Partial<GuidePickResponse> & Pick<GuidePickResponse, 'id'>): GuidePickResponse {
  return {
    city: 'Surabaya',
    place: 'Seven Cafe',
    description: 'Wifi kuat dan buka sampai tengah malam.',
    photoUrl: 'https://cdn.example.com/seven-cafe.webp',
    videoUrl: 'https://cdn.example.com/seven-cafe.mp4',
    isActive: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(initial: GuidePickResponse[] = []) {
  vi.mocked(guidePicksApi.list).mockResolvedValue(initial);
  render(<GuidePicksPage />);
  await waitFor(() => expect(guidePicksApi.list).toHaveBeenCalled());
}

/** The create form has two "Choose file" pickers — photo first, then video. */
function createFormFilePickers(): { photoPicker: HTMLElement; videoPicker: HTMLElement } {
  const [photoPicker, videoPicker] = screen.getAllByLabelText('Choose file');
  return { photoPicker: photoPicker!, videoPicker: videoPicker! };
}

describe('GuidePicksPage — new guide pick form', () => {
  /** specs/guide-of-the-week-management/spec.md - "A guide pick requires a photo", "A guide pick
   *  requires a self-hosted video". */
  it('keeps "Add guide pick" disabled until city, place, description, a photo, and a video are all present', async () => {
    await renderPage();

    const addButton = screen.getByRole('button', { name: 'Add guide pick' }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Surabaya' } });
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Seven Cafe' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Wifi kuat.' } });
    expect(addButton.disabled).toBe(true);

    const { photoPicker, videoPicker } = createFormFilePickers();

    vi.mocked(mediaApi.upload).mockResolvedValueOnce({
      id: 'media-1',
      url: 'https://cdn.example.com/seven-cafe.webp',
    } as never);
    const photoFile = new File(['x'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(photoPicker, { target: { files: [photoFile] } });
    });

    // Photo alone is not enough — the button stays disabled until a video is also uploaded.
    expect(addButton.disabled).toBe(true);

    vi.mocked(mediaApi.upload).mockResolvedValueOnce({
      id: 'media-1-video',
      url: 'https://cdn.example.com/seven-cafe.mp4',
    } as never);
    const videoFile = new File(['x'], 'video.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(videoPicker, { target: { files: [videoFile] } });
    });

    await waitFor(() => expect(addButton.disabled).toBe(false));
  });

  it('submits city, place, description, photoMediaId, and videoMediaId on create', async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Jakarta' } });
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Playground, Blok M' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Panggung kecil tiap Jumat.' } });

    const { photoPicker, videoPicker } = createFormFilePickers();

    vi.mocked(mediaApi.upload).mockResolvedValueOnce({ id: 'media-2', url: 'https://cdn.example.com/x.webp' } as never);
    const photoFile = new File(['x'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(photoPicker, { target: { files: [photoFile] } });
    });

    vi.mocked(mediaApi.upload).mockResolvedValueOnce({ id: 'media-2-video', url: 'https://cdn.example.com/x.mp4' } as never);
    const videoFile = new File(['x'], 'video.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(videoPicker, { target: { files: [videoFile] } });
    });

    vi.mocked(guidePicksApi.create).mockResolvedValue(guidePick({ id: 'new-1', city: 'Jakarta' }));
    await act(async () => {
      screen.getByRole('button', { name: 'Add guide pick' }).click();
    });

    expect(guidePicksApi.create).toHaveBeenCalledWith({
      city: 'Jakarta',
      place: 'Playground, Blok M',
      description: 'Panggung kecil tiap Jumat.',
      photoMediaId: 'media-2',
      videoMediaId: 'media-2-video',
    });
  });
});

describe('GuidePicksPage — no pick-count limit', () => {
  /** design.md - "No maximum pick count": nothing in the UI should block adding beyond two. */
  it('allows the "Add guide pick" control to remain usable with more than two picks already listed', async () => {
    const many = Array.from({ length: 5 }, (_, i) => guidePick({ id: `id-${i}`, sortOrder: i }));
    await renderPage(many);

    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Bandung' } });
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Warkop Baru' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Kopi murah, wifi kencang.' } });

    const { photoPicker, videoPicker } = createFormFilePickers();

    vi.mocked(mediaApi.upload).mockResolvedValueOnce({ id: 'media-3', url: 'https://cdn.example.com/y.webp' } as never);
    const photoFile = new File(['x'], 'photo.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(photoPicker, { target: { files: [photoFile] } });
    });

    vi.mocked(mediaApi.upload).mockResolvedValueOnce({ id: 'media-3-video', url: 'https://cdn.example.com/y.mp4' } as never);
    const videoFile = new File(['x'], 'video.mp4', { type: 'video/mp4' });
    await act(async () => {
      fireEvent.change(videoPicker, { target: { files: [videoFile] } });
    });

    const addButton = screen.getByRole('button', { name: 'Add guide pick' }) as HTMLButtonElement;
    await waitFor(() => expect(addButton.disabled).toBe(false));
  });
});

describe('GuidePicksPage — active toggle', () => {
  it('toggles a guide pick between active and inactive', async () => {
    const active = guidePick({ id: 'a', isActive: true });
    await renderPage([active]);

    vi.mocked(guidePicksApi.update).mockResolvedValue({ ...active, isActive: false });

    await act(async () => {
      screen.getByRole('button', { name: 'Active' }).click();
    });

    expect(guidePicksApi.update).toHaveBeenCalledWith('a', { isActive: false });
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeTruthy();
  });
});

describe('GuidePicksPage — reorder', () => {
  it('submits the full reordered id list on drop', async () => {
    const a = guidePick({ id: 'a', place: 'Alpha', sortOrder: 0 });
    const b = guidePick({ id: 'b', place: 'Beta', sortOrder: 1 });
    await renderPage([a, b]);

    vi.mocked(guidePicksApi.reorder).mockResolvedValue([
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

    expect(guidePicksApi.reorder).toHaveBeenCalledWith(['b', 'a']);
  });
});
