import { describe, expect, it } from 'vitest';
import { splitKeywords } from './splitKeywords';

describe('splitKeywords', () => {
  it('returns an empty array for null', () => {
    expect(splitKeywords(null)).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitKeywords('')).toEqual([]);
  });

  it('trims extra whitespace around each entry', () => {
    expect(splitKeywords('jakarta ,  kuliner,umkm')).toEqual(['jakarta', 'kuliner', 'umkm']);
  });

  it('drops empty entries from a trailing comma', () => {
    expect(splitKeywords('jakarta, kuliner,')).toEqual(['jakarta', 'kuliner']);
  });
});
