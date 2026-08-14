import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAsyncAction } from './useAsyncAction.js';
import { ApiError } from '../lib/api.js';

/**
 * specs/admin-session/spec.md - "A rendered control is still rejected when the permission is
 * actually absent": permission-aware rendering (AppShell) only decides what's *shown*; this is
 * the mechanism that makes the server's rejection of an attempted action authoritative
 * regardless of that — a 403 sets `forbidden`, and a control that was shown because previously
 * reported state said it should be is not proof of access.
 */
describe('useAsyncAction', () => {
  it('treats a 403 as authoritative, setting forbidden regardless of what was rendered', async () => {
    const { result } = renderHook(() => useAsyncAction(() => Promise.reject(new ApiError('Insufficient permission', 403, 'forbidden'))));

    await act(async () => {
      await expect(result.current[1]()).rejects.toBeInstanceOf(ApiError);
    });

    expect(result.current[0]).toMatchObject({ loading: false, forbidden: true });
  });

  it('does not set forbidden for a non-403 failure', async () => {
    const { result } = renderHook(() => useAsyncAction(() => Promise.reject(new ApiError('Server error', 500))));

    await act(async () => {
      await expect(result.current[1]()).rejects.toBeInstanceOf(ApiError);
    });

    expect(result.current[0]).toMatchObject({ loading: false, forbidden: false });
  });

  it('clears forbidden and resolves normally on success', async () => {
    const { result } = renderHook(() => useAsyncAction((n: number) => Promise.resolve(n * 2)));

    let value: number | undefined;
    await act(async () => {
      value = await result.current[1](21);
    });

    expect(value).toBe(42);
    expect(result.current[0]).toMatchObject({ loading: false, forbidden: false, errorMessage: null });
  });
});
