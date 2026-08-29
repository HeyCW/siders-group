import { describe, expect, it } from 'vitest';
import type { PublicGuidePick } from '@siders/contracts';
import { groupGuidePicksByCity } from './guidePicks.js';

function pick(overrides: Partial<PublicGuidePick> & Pick<PublicGuidePick, 'place' | 'city'>): PublicGuidePick {
  return {
    description: 'desc',
    photoUrl: 'https://cdn.example.com/photo.webp',
    videoUrl: 'https://cdn.example.com/video.mp4',
    ...overrides,
  };
}

describe('groupGuidePicksByCity', () => {
  it('returns no groups for an empty input', () => {
    expect(groupGuidePicksByCity([])).toEqual([]);
  });

  it('groups picks sharing the same city', () => {
    const picks = [
      pick({ city: 'Surabaya', place: 'Seven Cafe' }),
      pick({ city: 'Surabaya', place: 'Taman Bungkul' }),
    ];
    const groups = groupGuidePicksByCity(picks);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.picks.map((p) => p.place)).toEqual(['Seven Cafe', 'Taman Bungkul']);
  });

  it('orders groups by first appearance, not alphabetically', () => {
    const picks = [
      pick({ city: 'Jakarta', place: 'Blok M' }),
      pick({ city: 'Surabaya', place: 'Seven Cafe' }),
    ];
    const groups = groupGuidePicksByCity(picks);
    expect(groups.map((g) => g.city)).toEqual(['Jakarta', 'Surabaya']);
  });

  it('collapses case and whitespace variants of the same city into one group, labeled by first appearance', () => {
    const picks = [
      pick({ city: 'Surabaya', place: 'Seven Cafe' }),
      pick({ city: ' surabaya ', place: 'Taman Bungkul' }),
      pick({ city: 'SURABAYA', place: 'House of Sampoerna' }),
    ];
    const groups = groupGuidePicksByCity(picks);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.city).toBe('Surabaya');
    expect(groups[0]?.picks).toHaveLength(3);
  });

  it('gives every distinct city its own group, including one seen only once', () => {
    const picks = [
      pick({ city: 'Surabaya', place: 'Seven Cafe' }),
      pick({ city: 'Jakarta', place: 'Blok M' }),
      pick({ city: 'Bandung', place: 'Braga Street' }),
    ];
    const groups = groupGuidePicksByCity(picks);
    expect(groups.map((g) => g.city)).toEqual(['Surabaya', 'Jakarta', 'Bandung']);
  });

  it('preserves each pick\'s relative order within its group', () => {
    const picks = [
      pick({ city: 'Surabaya', place: 'First' }),
      pick({ city: 'Jakarta', place: 'Interleaved' }),
      pick({ city: 'Surabaya', place: 'Second' }),
    ];
    const groups = groupGuidePicksByCity(picks);
    const surabaya = groups.find((g) => g.city === 'Surabaya');
    expect(surabaya?.picks.map((p) => p.place)).toEqual(['First', 'Second']);
  });
});
